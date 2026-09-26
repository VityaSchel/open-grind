import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import z from "zod";

import { assertLiveWrite, liveAccounts } from "./accounts";
import { stopForRateLimit } from "./rate-limit";

const repoRoot = join(import.meta.dirname, "..", "..");
const manifest = join(repoRoot, "src-tauri", "Cargo.toml");
const binary = join(
	repoRoot,
	"src-tauri",
	"target",
	"debug",
	"examples",
	"live-counterpart",
);
const rateLimitedExitCode = 3;

export class CounterpartError extends Error {
	override name = "CounterpartError";
}

const failureSchema = z.object({
	ok: z.literal(false),
	error: z.string(),
	detail: z.string().optional(),
	code: z.number().optional(),
});

export function buildCounterpart() {
	execFileSync(
		"cargo",
		["build", "--manifest-path", manifest, "--example", "live-counterpart"],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
}

async function runCounterpart(args: string[]) {
	const child = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"] });
	let stdout = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
	});
	const exitCode = await new Promise<number | null>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", resolve);
	});
	if (exitCode === rateLimitedExitCode) {
		throw stopForRateLimit("the counterpart");
	}
	let output: unknown;
	try {
		output = JSON.parse(stdout);
	} catch {
		throw new CounterpartError(
			`The counterpart exited with ${exitCode} and no JSON`,
		);
	}
	const failure = failureSchema.safeParse(output);
	if (failure.success) {
		const { error, detail, code } = failure.data;
		throw new CounterpartError(
			[`${args[0]} failed: ${error}`, detail, code]
				.filter(Boolean)
				.join(" "),
		);
	}
	return output;
}

const pairFlags = [
	"--as",
	String(liveAccounts.counterpart),
	"--peer",
	String(liveAccounts.app),
];

function assertCounterpartWrite() {
	assertLiveWrite({
		actor: liveAccounts.counterpart,
		target: liveAccounts.app,
	});
}

export const counterpart = {
	async probe() {
		return z
			.object({ status: z.number(), profileId: z.coerce.string() })
			.parse(await runCounterpart(["probe"]));
	},

	async sendText(text: string) {
		assertCounterpartWrite();
		return z
			.object({ messageId: z.string(), conversationId: z.string() })
			.parse(
				await runCounterpart([
					"send-text",
					...pairFlags,
					"--text",
					text,
				]),
			);
	},

	async findMessage({
		text,
		type,
		sinceMs,
		timeoutMs,
	}: {
		text?: string;
		type?: string;
		sinceMs?: number;
		timeoutMs?: number;
	}) {
		const flags = Object.entries({
			text,
			type,
			"since-ms": sinceMs,
			"timeout-ms": timeoutMs,
		}).flatMap(([name, value]) =>
			value === undefined ? [] : [`--${name}`, String(value)],
		);
		return z
			.object({ found: z.boolean(), messageId: z.string().optional() })
			.parse(
				await runCounterpart(["find-message", ...pairFlags, ...flags]),
			);
	},

	async deleteConversation() {
		assertCounterpartWrite();
		return z
			.object({ status: z.number() })
			.parse(await runCounterpart(["delete-conversation", ...pairFlags]));
	},

	async waitForAlbumShare({
		albumId,
		shared,
		timeoutMs = 60_000,
	}: {
		albumId: string;
		shared: boolean;
		timeoutMs?: number;
	}) {
		return z
			.object({ settled: z.boolean(), albumIds: z.array(z.string()) })
			.parse(
				await runCounterpart([
					"shared-albums",
					...pairFlags,
					"--album-id",
					albumId,
					"--expect",
					shared ? "shared" : "unshared",
					"--timeout-ms",
					String(timeoutMs),
				]),
			);
	},
};
