import { decode, encode } from "@msgpack/msgpack";
import z from "zod";
import type { Page } from "@playwright/test";

import { assertLiveRequest, assertLiveWrite, liveAccounts } from "./accounts";
import { stopForRateLimit } from "./rate-limit";

type TauriWindow = {
	__TAURI_INTERNALS__: { invoke: (...call: unknown[]) => Promise<unknown> };
	__ogLiveRateLimits?: number;
};

const rateLimitedResponsePrefix = Buffer.from(
	encode({ status: 429, body: new Uint8Array() }),
)
	.toString("base64")
	.slice(0, 16);

export class AppRequestError extends Error {
	override name = "AppRequestError";
}

export async function invoke({
	page,
	command,
	args,
}: {
	page: Page;
	command: string;
	args?: unknown;
}) {
	const outcome = await page.evaluate(
		async ({ command, args }) => {
			try {
				const value = await (
					window as unknown as TauriWindow
				).__TAURI_INTERNALS__.invoke(command, args);
				return { ok: true as const, value };
			} catch (error) {
				const kind =
					typeof error === "object" &&
					error !== null &&
					"kind" in error
						? String(error.kind)
						: null;
				return { ok: false as const, kind };
			}
		},
		{ command, args },
	);
	if (outcome.ok) return outcome.value;
	if (outcome.kind === "RateLimited") throw stopForRateLimit("the app");
	throw new AppRequestError(
		`${command} failed with ${outcome.kind ?? "an unknown error"}`,
	);
}

export async function signedInProfileId(page: Page) {
	const session = z
		.object({ profileId: z.number().nullable() })
		.parse(await invoke({ page, command: "current_session" }));
	return session.profileId;
}

const restResponseSchema = z.object({
	status: z.number(),
	body: z.instanceof(Uint8Array),
});

export async function appRequest({
	page,
	method,
	path,
	body,
	target,
}: {
	page: Page;
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	path: string;
	body?: unknown;
	target?: number;
}) {
	if (method !== "GET") {
		if (target === undefined) {
			throw new AppRequestError(
				`${method} ${path} needs a target account`,
			);
		}
		assertLiveWrite({ actor: liveAccounts.app, target });
		assertLiveRequest({ path, body });
	}
	const payload = Buffer.from(
		encode({
			method,
			path,
			body: body === undefined ? null : encode(body),
		}),
	).toString("base64");
	const encoded = z
		.string()
		.parse(await invoke({ page, command: "request", args: { payload } }));
	const { status, body: responseBody } = restResponseSchema.parse(
		decode(Buffer.from(encoded, "base64")),
	);
	if (status === 429) throw stopForRateLimit("the app");
	const text = new TextDecoder().decode(responseBody);
	return {
		status,
		json(): unknown {
			return text === "" ? null : JSON.parse(text);
		},
	};
}

export async function watchRateLimits(page: Page) {
	await page.evaluate((rateLimitedPrefix) => {
		const tauriWindow = window as unknown as TauriWindow;
		if (tauriWindow.__ogLiveRateLimits !== undefined) return;
		tauriWindow.__ogLiveRateLimits = 0;
		const countRateLimit = () => {
			tauriWindow.__ogLiveRateLimits =
				(tauriWindow.__ogLiveRateLimits ?? 0) + 1;
		};
		const encodedResponseOf = (result: unknown) =>
			typeof result === "object" &&
			result !== null &&
			"response" in result
				? result.response
				: result;
		const internals = tauriWindow.__TAURI_INTERNALS__;
		const original = internals.invoke.bind(internals);
		internals.invoke = async (...call) => {
			try {
				const result = await original(...call);
				const encoded = encodedResponseOf(result);
				if (
					typeof encoded === "string" &&
					encoded.startsWith(rateLimitedPrefix)
				) {
					countRateLimit();
				}
				return result;
			} catch (error) {
				if (
					typeof error === "object" &&
					error !== null &&
					"kind" in error &&
					error.kind === "RateLimited"
				) {
					countRateLimit();
				}
				throw error;
			}
		};
	}, rateLimitedResponsePrefix);
}

export async function rateLimitsSeen(page: Page) {
	return await page.evaluate(
		() => (window as unknown as TauriWindow).__ogLiveRateLimits ?? 0,
	);
}
