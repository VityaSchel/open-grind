import { describe, expect, it } from "vitest";
import z from "zod";

import { urlSearchParamsCodec } from "$lib/util/url-search-params";

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
