import { describe, expect, it } from "vitest";

import { parseSignedUrl, stableSignedUrl } from "./signed-url";

describe("parseSignedUrl", () => {
	it("splits a signed CloudFront url into its file and expiry", () => {
		expect(
			parseSignedUrl(
				"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1700000000&Signature=x~y&Key-Pair-Id=K",
			),
		).toEqual({
			unsigned: "https://d3lyqctnm3b6pb.cloudfront.net/a.jpg",
			expiresAt: 1_700_000_000_000,
		});
	});

	it("never expires a signature that carries no Expires", () => {
		expect(
			parseSignedUrl("https://d3.cloudfront.net/a.jpg?Signature=x")
				?.expiresAt,
		).toBe(Number.POSITIVE_INFINITY);
	});

	it("leaves unsigned urls alone", () => {
		expect(
			parseSignedUrl("https://cdns.grindr.com/images/thumb/320x320/ff"),
		).toBeNull();
		expect(
			parseSignedUrl("https://cdns.grindr.com/x?Expires=1"),
		).toBeNull();
	});
});

describe("stableSignedUrl", () => {
	const signed = (signature: string) =>
		`https://d3.cloudfront.net/a.jpg?Expires=1700000900&Signature=${signature}`;

	it("keeps the loaded url while the latest one signs the same file", () => {
		expect(
			stableSignedUrl({ latest: signed("NEW"), loaded: signed("OLD") }),
		).toBe(signed("OLD"));
	});

	it("takes the latest url for another file or before anything loaded", () => {
		const other = "https://d3.cloudfront.net/b.jpg?Signature=NEW";

		expect(stableSignedUrl({ latest: other, loaded: signed("OLD") })).toBe(
			other,
		);
		expect(stableSignedUrl({ latest: signed("NEW"), loaded: null })).toBe(
			signed("NEW"),
		);
		expect(stableSignedUrl({ latest: null, loaded: signed("OLD") })).toBe(
			null,
		);
	});

	it("never pins unsigned urls that differ", () => {
		expect(
			stableSignedUrl({
				latest: "https://cdns.grindr.com/x?v=2",
				loaded: "https://cdns.grindr.com/x?v=1",
			}),
		).toBe("https://cdns.grindr.com/x?v=2");
	});
});
