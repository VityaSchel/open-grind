import { beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

import {
	arrayOfKnownVariants,
	arrayOfParsableEntries,
	knownValueOr,
	knownValueOrNull,
	serverDefault,
} from "$lib/model/tolerance";

const variants = z.discriminatedUnion("@type", [
	z.object({ "@type": z.literal("Location"), name: z.string() }),
	z.object({ "@type": z.literal("Cta") }),
]);

async function freshArrayOfKnownVariants() {
	vi.resetModules();
	const tolerance = await import("$lib/model/tolerance");
	return tolerance.arrayOfKnownVariants({ variants, label: "probe" });
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("arrayOfKnownVariants", () => {
	const schema = arrayOfKnownVariants({ variants, label: "probe" });

	it("keeps modeled variants and drops the ones it has never seen", () => {
		expect(
			schema.parse([
				{ "@type": "Location", name: "Soho" },
				{ "@type": "SomethingNew", payload: { nested: true } },
				{ "@type": "Cta" },
			]),
		).toEqual([{ "@type": "Location", name: "Soho" }, { "@type": "Cta" }]);
	});

	it("drops entries whose discriminator is absent or null", () => {
		expect(
			schema.parse([
				{ "@type": null },
				{ name: "Soho" },
				{ "@type": "Cta" },
			]),
		).toEqual([{ "@type": "Cta" }]);
	});

	it("drops null and non-object entries", () => {
		expect(schema.parse([null, 42, "Cta", { "@type": "Cta" }])).toEqual([
			{ "@type": "Cta" },
		]);
	});

	it("still rejects a modeled variant whose body drifted", () => {
		expect(schema.safeParse([{ "@type": "Location" }]).success).toBe(false);
	});

	it("leaves a non-array to fail as an array", () => {
		const result = schema.safeParse("not an array");

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.code).toBe("invalid_type");
	});

	it("refuses a union whose discriminator is not a literal", () => {
		const enumDiscriminated = z.discriminatedUnion("kind", [
			z.object({ kind: z.enum(["Location", "Cta"]) }),
		]);

		expect(() =>
			arrayOfKnownVariants({
				variants: enumDiscriminated,
				label: "probe",
			}),
		).toThrow(/literal on every variant/);
	});

	it("names the dropped variant once per distinct reason", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fresh = await freshArrayOfKnownVariants();

		fresh.parse([{ "@type": "SomethingNew" }, { "@type": "SomethingNew" }]);
		fresh.parse([{ "@type": "AnotherNew" }]);

		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0]?.[0]).toContain('"SomethingNew"');
		expect(warn.mock.calls[1]?.[0]).toContain('"AnotherNew"');
	});
});

describe("knownValueOrNull", () => {
	const status = knownValueOrNull({
		value: z.enum(["ACTIVE", "HIDDEN"]),
		label: "probe",
	});

	it("keeps a recognized value", () => {
		expect(status.parse("ACTIVE")).toBe("ACTIVE");
	});

	it("degrades an unrecognized value to null", () => {
		expect(status.parse("BRAND_NEW")).toBeNull();
	});

	it("still accepts null", () => {
		expect(status.parse(null)).toBeNull();
	});

	it("treats an absent field as absent, without reporting a value", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(status.parse(undefined)).toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it("degrades a value of the wrong type rather than failing", () => {
		expect(status.parse(42)).toBeNull();
	});
});

describe("knownValueOr", () => {
	const status = knownValueOr({
		value: z.enum(["NOT_ACTIVE", "HOSTING"]),
		fallback: "NOT_ACTIVE" as const,
		label: "probe",
	});

	it("keeps a recognized value", () => {
		expect(status.parse("HOSTING")).toBe("HOSTING");
	});

	it("falls back for an unrecognized value", () => {
		expect(status.parse("BRAND_NEW")).toBe("NOT_ACTIVE");
	});
});

describe("arrayOfParsableEntries", () => {
	const entries = arrayOfParsableEntries({
		entries: z.object({ id: z.int(), name: z.string() }),
		label: "probe",
	});

	it("keeps the entries it can parse and drops the rest", () => {
		expect(
			entries.parse([
				{ id: 1, name: "Bear" },
				{ id: 2 },
				{ id: 3, name: "Otter" },
			]),
		).toEqual([
			{ id: 1, name: "Bear" },
			{ id: 3, name: "Otter" },
		]);
	});

	it("drops null and non-object entries", () => {
		expect(entries.parse([null, 7, { id: 1, name: "Bear" }])).toEqual([
			{ id: 1, name: "Bear" },
		]);
	});

	it("collapses a wholly unparsable list to empty rather than failing", () => {
		expect(entries.parse([{ id: "x" }])).toEqual([]);
	});

	it("still rejects a value that is not an array", () => {
		expect(entries.safeParse({ id: 1, name: "Bear" }).success).toBe(false);
	});

	it("names the drifted field once", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.resetModules();
		const tolerance = await import("$lib/model/tolerance");
		const fresh = tolerance.arrayOfParsableEntries({
			entries: z.object({ id: z.int(), name: z.string() }),
			label: "probe",
		});

		fresh.parse([{ id: 1 }, { id: 2 }]);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain("name");
	});
});

describe("serverDefault", () => {
	const flag = serverDefault({ value: z.boolean(), fallback: false });

	it.each([
		["an absent field", undefined],
		["an explicit null, which the official client strips", null],
	])("falls back for %s", (_, input) => {
		expect(flag.parse(input)).toBe(false);
	});

	it("keeps a value the server did send", () => {
		expect(flag.parse(true)).toBe(true);
	});

	it("still rejects a value of the wrong type", () => {
		expect(flag.safeParse("yes").success).toBe(false);
	});
});
