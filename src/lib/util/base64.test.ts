import { describe, expect, it } from "vitest";

import { fromBase64, toBase64, toBase64Url } from "$lib/util/base64";

describe("base64 helpers", () => {
	it("round-trips arbitrary byte values", () => {
		const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);

		expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(
			Array.from(bytes),
		);
	});

	it("handles empty byte arrays", () => {
		expect(toBase64(new Uint8Array())).toBe("");
		expect(fromBase64("")).toEqual(new Uint8Array());
	});
});

describe("toBase64Url", () => {
	it("emits only characters that survive a url path unescaped", () => {
		const bytes = new Uint8Array(256).map((_, i) => i);

		expect(toBase64Url(bytes)).toMatch(/^[A-Za-z0-9\-_]*$/);
	});

	it("decodes back through the standard alphabet", () => {
		const url =
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=x+y/z";
		const bytes = new TextEncoder().encode(url);

		const restored = toBase64Url(bytes)
			.replaceAll("-", "+")
			.replaceAll("_", "/");

		expect(new TextDecoder().decode(fromBase64(restored))).toBe(url);
	});
});
