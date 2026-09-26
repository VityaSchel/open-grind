import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireRunLock, LiveRunLockedError } from "./lock";

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "og-lock-"));
	file = join(dir, "run.lock");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("acquireRunLock", () => {
	it("refuses a second run while the first one is alive", () => {
		acquireRunLock({ file, pid: 100, isAlive: () => true });
		expect(() =>
			acquireRunLock({ file, pid: 200, isAlive: () => true }),
		).toThrow(LiveRunLockedError);
	});

	it("takes over a lock left behind by a run that died", () => {
		acquireRunLock({ file, pid: 100, isAlive: () => true });
		expect(() =>
			acquireRunLock({ file, pid: 200, isAlive: (pid) => pid !== 100 }),
		).not.toThrow();
	});

	it("frees the lock on release", () => {
		acquireRunLock({ file, pid: 100, isAlive: () => true }).release();
		expect(existsSync(file)).toBe(false);
		expect(() =>
			acquireRunLock({ file, pid: 200, isAlive: () => true }),
		).not.toThrow();
	});

	it("never releases a lock that another run took over", () => {
		const stale = acquireRunLock({ file, pid: 100, isAlive: () => true });
		acquireRunLock({ file, pid: 200, isAlive: (pid) => pid !== 100 });
		stale.release();
		expect(existsSync(file)).toBe(true);
	});
});
