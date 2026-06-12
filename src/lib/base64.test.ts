import { describe, expect, it } from "vitest";

import { fromBase64, toBase64 } from "$lib/base64";

describe("base64 helpers", () => {
	it("round-trips arbitrary byte values", () => {
		const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);

		expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
	});

	it("handles empty byte arrays", () => {
		expect(toBase64(new Uint8Array())).toBe("");
		expect(fromBase64("")).toEqual(new Uint8Array());
	});
});
