import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import z from "zod";

import { liveStatePaths } from "./state";

const holderSchema = z.object({ pid: z.int(), startedAt: z.string() });
type Holder = z.infer<typeof holderSchema>;

export class LiveRunLockedError extends Error {
	override name = "LiveRunLockedError";

	constructor(holder: Holder | null) {
		super(
			holder === null
				? "Another live run holds the lock"
				: `Another live run (pid ${holder.pid}, since ${holder.startedAt}) holds the lock`,
		);
	}
}

function hasCode(error: unknown, code: string) {
	return error instanceof Error && "code" in error && error.code === code;
}

function processIsAlive(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return hasCode(error, "EPERM");
	}
}

function readHolder(file: string): Holder | null {
	try {
		return holderSchema.parse(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return null;
	}
}

function tryCreate({ file, holder }: { file: string; holder: Holder }) {
	try {
		writeFileSync(file, JSON.stringify(holder), { flag: "wx" });
		return true;
	} catch (error) {
		if (hasCode(error, "EEXIST")) return false;
		throw error;
	}
}

export function acquireRunLock({
	file = liveStatePaths.lock,
	pid = process.pid,
	isAlive = processIsAlive,
}: { file?: string; pid?: number; isAlive?: (pid: number) => boolean } = {}) {
	mkdirSync(dirname(file), { recursive: true });
	const holder = { pid, startedAt: new Date().toISOString() };
	if (!tryCreate({ file, holder })) {
		const current = readHolder(file);
		if (current !== null && isAlive(current.pid)) {
			throw new LiveRunLockedError(current);
		}
		rmSync(file, { force: true });
		if (!tryCreate({ file, holder })) {
			throw new LiveRunLockedError(readHolder(file));
		}
	}
	return {
		release() {
			if (readHolder(file)?.pid === pid) rmSync(file, { force: true });
		},
	};
}
