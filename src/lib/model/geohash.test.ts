import { describe, expect, it } from "vitest";

import {
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
		const hash = encodeGeohash(lat, lon);
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
