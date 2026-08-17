import { decode, encode } from "@msgpack/msgpack";
import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import {
	asAppError,
	blockedKindOf,
	markRequestBlocked,
} from "$lib/api/methods";
import { signOutIfSessionLost } from "$lib/api/session-lost";
import { demoEnabled, demoRoute } from "$lib/demo";
import { schemaName } from "$lib/model/schema-names";
import { fromBase64, toBase64 } from "$lib/util/base64";

type RequestInfo = { method: string; path: string; body: unknown };

// https://github.com/tauri-apps/tauri/issues/10573
async function invokeWithBinaryPayload(
	payload: Uint8Array,
): Promise<Uint8Array> {
	const res = await invoke("request", { payload: toBase64(payload) });
	if (typeof res !== "string") {
		throw new Error("Invalid response from backend");
	}
	return fromBase64(res);
}

function buildRestResponse({
	status,
	responseBody,
	requestInfo,
}: {
	status: number;
	responseBody: Uint8Array;
	requestInfo: RequestInfo;
}) {
	let decoded: string | undefined;
	const text = () => (decoded ??= new TextDecoder().decode(responseBody));
	return {
		status,
		bytes() {
			return responseBody;
		},
		text,
		assertOk() {
			if (status >= 200 && status < 300) {
				return;
			}
			throw new ApiError({
				message: `API request failed with status ${status}`,
				request: requestInfo,
				response: { status, body: text() },
			});
		},
		json() {
			try {
				return JSON.parse(text());
			} catch (error) {
				console.error("Failed to parse JSON response", {
					path: requestInfo.path,
					text: text(),
				});
				throw new ApiError({
					message: "Failed to parse API response",
					request: requestInfo,
					response: { status, body: text() },
					cause: error,
				});
			}
		},
		jsonParsed<TSchema extends z.ZodType>(schema: TSchema) {
			const data = this.json();
			try {
				return parseApiResponse({
					schema,
					data,
					path: requestInfo.path,
					method: requestInfo.method,
				});
			} catch (error) {
				if (error instanceof ApiError) throw error;
				throw new ApiError({
					message: schemaMismatchMessage({ schema, error }),
					request: requestInfo,
					response: { status, body: text() },
					cause: error,
				});
			}
		},
	};
}

export async function fetchRest(
	path: string,
	options: {
		method?: string;
		body?: unknown;
		abortController?: AbortController;
	} = { method: "GET" },
) {
	const method = options.method ?? "GET";
	const requestInfo = { method, path, body: options.body };
	if (demoEnabled) {
		const { status, body } = demoRoute({
			path,
			method,
			body: options.body,
		});
		const responseBody = new TextEncoder().encode(
			JSON.stringify(body ?? null),
		);
		return buildRestResponse({ status, responseBody, requestInfo });
	}
	try {
		const payload = encode({
			method: options.method || "GET",
			path,
			body: options.body === undefined ? null : encode(options.body),
		});
		const packed = await invokeWithBinaryPayload(payload);
		if (options.abortController?.signal.aborted) {
			throw new Error("Request aborted");
		}
		const decoded = decode(packed);
		const { status, body: responseBody } = z
			.object({ status: z.number(), body: z.instanceof(Uint8Array) })
			.parse(decoded);
		return buildRestResponse({ status, responseBody, requestInfo });
	} catch (error) {
		if (error instanceof ApiError) throw error;
		const appError = asAppError(error);
		if (appError !== undefined) {
			const blocked = blockedKindOf(appError.kind);
			if (blocked !== undefined) {
				markRequestBlocked({ kind: blocked });
				throw new ApiError({
					message:
						blocked === "network"
							? "Request blocked before it reached Grindr"
							: "Request blocked by Grindr",
					request: requestInfo,
					response: null,
					kind: appError.kind,
					cause: error,
				});
			}
		}
		if (appError?.kind === "NotLoggedIn") {
			signOutIfSessionLost().catch((error) => console.error(error));
		}
		throw new ApiError({
			message:
				appError?.prettyMessage ??
				(error instanceof Error ? error.message : String(error)),
			request: requestInfo,
			response: null,
			kind: appError?.kind ?? null,
			cause: error,
		});
	}
}

export function parseApiResponse<TSchema extends z.ZodType>(options: {
	schema: TSchema;
	data: unknown;
	path: string;
	method?: string;
}): z.infer<TSchema> {
	const parsed = options.schema.safeParse(options.data);
	if (parsed.success) {
		return parsed.data;
	}

	console.error("API response schema validation failed", {
		path: options.path,
		method: options.method ?? "GET",
		schema: schemaName(options.schema),
		issues: parsed.error.issues,
		response: options.data,
	});

	throw parsed.error;
}

function schemaMismatchMessage({
	schema,
	error,
}: {
	schema: z.ZodType;
	error: unknown;
}): string {
	if (error instanceof z.ZodError) {
		return `API response did not match ${schemaName(schema) ?? "the expected schema"}`;
	}
	return error instanceof Error
		? error.message
		: "API response validation failed";
}
