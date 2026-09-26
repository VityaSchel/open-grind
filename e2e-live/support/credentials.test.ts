import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialsError, readBurnerCredentials } from "./credentials";

describe("burner credentials", () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "og-live-credentials-"));
		file = join(dir, "burner.txt");
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("splits the line at the first colon so the password may hold colons", () => {
		writeFileSync(file, "burner@example.com:pa:ss\n");
		expect(readBurnerCredentials(file)).toEqual({
			email: "burner@example.com",
			password: "pa:ss",
		});
	});

	it("rejects a malformed line without echoing it", () => {
		writeFileSync(file, "leaked-secret-without-separator");
		expect(() => readBurnerCredentials(file)).toThrow(CredentialsError);
		expect(() => readBurnerCredentials(file)).not.toThrow(/leaked-secret/);
	});

	it("rejects an empty password", () => {
		writeFileSync(file, "burner@example.com:");
		expect(() => readBurnerCredentials(file)).toThrow(CredentialsError);
	});

	it("reports a missing file without naming its path", () => {
		expect(() => readBurnerCredentials(join(dir, "missing.txt"))).toThrow(
			/^The burner credentials file is unreadable$/,
		);
	});
});
