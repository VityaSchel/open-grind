import { describe, expect, it } from "vitest";

import {
	coarsenGeohash,
	decodeGeohash,
	encodeGeohash,
	geohashSchema,
} from "$lib/model/geohash";

describe("geohashSchema", () => {
	it("accepts twelve-character base32 geohashes", () => {
		expect(geohashSchema.parse("u2fkb88pbpbp")).toBe("u2fkb88pbpbp");
	});

	it("rejects invalid precision and excluded characters", () => {
		expect(geohashSchema.safeParse("u2fkb88pbpb").success).toBe(false);
		expect(geohashSchema.safeParse("u2fkb88pbpbi").success).toBe(false);
	});
});

describe("encodeGeohash and decodeGeohash", () => {
	it("round-trips coordinates within the encoded error bounds", () => {
		const lat = 42.6977;
		const lon = 23.3219;
		const hash = encodeGeohash({ lat, lon });
		const decoded = decodeGeohash(hash);

		expect(hash).toHaveLength(12);
		expect(Math.abs(decoded.lat - lat)).toBeLessThanOrEqual(decoded.latErr);
		expect(Math.abs(decoded.lon - lon)).toBeLessThanOrEqual(decoded.lonErr);
	});

	it("decodes uppercase hashes and rejects invalid characters", () => {
		expect(decodeGeohash("U2FKB88PBPBP").lat).toBeCloseTo(
			decodeGeohash("u2fkb88pbpbp").lat,
		);
		expect(() => decodeGeohash("u2fkb88pbpbi")).toThrow(
			"Invalid geohash char: i",
		);
	});
});

describe("coarsenGeohash", () => {
	it("keeps the value on a ~110m grid, matching the official app", () => {
		const exact = encodeGeohash({ lat: 52.5200123, lon: 13.4050456 });
		const coarse = coarsenGeohash(exact);

		expect(coarse).toHaveLength(12);
		expect(geohashSchema.safeParse(coarse).success).toBe(true);
		expect(coarse).not.toBe(exact);

		const decoded = decodeGeohash(coarse);
		expect(decoded.lat).toBeCloseTo(52.52, 6);
		expect(decoded.lon).toBeCloseTo(13.405, 6);
	});

	it("collapses fixes that share a rounded cell to one value", () => {
		const a = coarsenGeohash(
			encodeGeohash({ lat: 52.52001, lon: 13.40501 }),
		);
		const b = coarsenGeohash(
			encodeGeohash({ lat: 52.52048, lon: 13.40549 }),
		);
		expect(a).toBe(b);
	});

	it("is idempotent", () => {
		const once = coarsenGeohash(
			encodeGeohash({ lat: 42.6977, lon: 23.3219 }),
		);
		expect(coarsenGeohash(once)).toBe(once);
	});

	it("handles southern and western hemispheres", () => {
		const decoded = decodeGeohash(
			coarsenGeohash(encodeGeohash({ lat: -33.86881, lon: -151.20929 })),
		);
		expect(decoded.lat).toBeCloseTo(-33.869, 6);
		expect(decoded.lon).toBeCloseTo(-151.209, 6);
	});
});
