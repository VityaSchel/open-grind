import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearStop, stopReason, stopTheRun } from "./rate-limit";

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "og-stop-"));
	file = join(dir, "stop.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("run stop marker", () => {
	it("has no reason to stop before anything is marked", () => {
		expect(stopReason(file)).toBeNull();
	});

	it("remembers why the run stopped", () => {
		stopTheRun({ reason: "Grindr rate limited the counterpart", file });
		expect(stopReason(file)).toBe("Grindr rate limited the counterpart");
	});

	it("still stops the run when the marker is unreadable", () => {
		writeFileSync(file, "{");
		expect(() => stopReason(file)).not.toThrow();
		expect(stopReason(file)).not.toBeNull();
	});

	it("lets the next run start after the marker is cleared", () => {
		stopTheRun({ reason: "rate limited", file });
		clearStop(file);
		expect(stopReason(file)).toBeNull();
	});
});
