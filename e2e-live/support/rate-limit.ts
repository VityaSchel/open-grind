import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import z from "zod";

import { liveStatePaths } from "./state";

const stopSchema = z.object({ reason: z.string() });

export class RateLimitedError extends Error {
	override name = "RateLimitedError";

	constructor(source: string) {
		super(`Grindr rate limited ${source}; the live run stops here`);
	}
}

export function stopForRateLimit(
	source: string,
	{ file = liveStatePaths.stop }: { file?: string } = {},
) {
	stopTheRun({ reason: `Grindr rate limited ${source}`, file });
	return new RateLimitedError(source);
}

export function stopTheRun({
	reason,
	file = liveStatePaths.stop,
}: {
	reason: string;
	file?: string;
}) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(
		file,
		JSON.stringify({ reason, at: new Date().toISOString() }),
	);
}

export function stopReason(file = liveStatePaths.stop): string | null {
	if (!existsSync(file)) return null;
	try {
		return stopSchema.parse(JSON.parse(readFileSync(file, "utf8"))).reason;
	} catch {
		return "an unreadable stop marker";
	}
}

export function clearStop(file = liveStatePaths.stop) {
	rmSync(file, { force: true });
}
