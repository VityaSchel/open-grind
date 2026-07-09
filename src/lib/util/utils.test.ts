import { afterEach, describe, expect, it, vi } from "vitest";
import z from "zod";

import { formatTimeRelativeCustom, urlSearchParamsCodec } from "$lib/util/utils";

afterEach(() => {
	vi.useRealTimers();
});

describe("urlSearchParamsCodec", () => {
	const codec = urlSearchParamsCodec(
		z.object({
			active: z.boolean().optional(),
			count: z.number().optional(),
			ids: z.array(z.string()).optional(),
			ranks: z.array(z.number()).optional(),
			label: z.string().optional(),
		}),
	);

	it("decodes URLSearchParams into schema-shaped values", () => {
		const parsed = z.decode(
			codec,
			new URLSearchParams({
				active: "true",
				count: "3",
				ids: "a,b,c",
				ranks: "1,2,3",
				label: "nearby",
			}),
		);

		expect(parsed).toEqual({
			active: true,
			count: 3,
			ids: ["a", "b", "c"],
			ranks: [1, 2, 3],
			label: "nearby",
		});
	});

	it("decodes empty array parameters as empty arrays", () => {
		const parsed = z.decode(
			codec,
			new URLSearchParams({
				ids: "",
				ranks: "",
			}),
		);

		expect(parsed).toEqual({
			ids: [],
			ranks: [],
		});
	});

	it("encodes defined scalar and array values while omitting nullish values", () => {
		const params = z.encode(codec, {
			active: false,
			count: 0,
			ids: ["x", "y"],
			ranks: [],
			label: undefined,
		});

		expect(params.toString()).toBe("active=false&count=0&ids=x%2Cy&ranks=");
	});
});

describe("formatTimeRelativeCustom", () => {
	it("formats recent and older timestamps relative to now", () => {
		vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

		expect(formatTimeRelativeCustom(Date.now() - 30_000)).toBe("Just now");
		expect(formatTimeRelativeCustom(Date.now() - 2 * 60_000)).toBe("2 mins");
		expect(formatTimeRelativeCustom(Date.now() - 2 * 60 * 60_000)).toBe(
			"2 hrs",
		);
		expect(formatTimeRelativeCustom(Date.now() - 25 * 60 * 60_000)).toBe(
			"Yesterday",
		);
	});

	it("returns an empty label for negative timestamps", () => {
		expect(formatTimeRelativeCustom(-1)).toBe("");
	});
});
