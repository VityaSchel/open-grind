import { describe, expect, it, vi } from "vitest";
import z from "zod";

import { parseApiResponse, schemaMismatchMessage } from "$lib/api/transport";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";

describe("parseApiResponse", () => {
	it("returns schema-parsed response data", () => {
		const parsed = parseApiResponse({
			path: "/v8/sessions",
			method: "POST",
			schema: z.object({
				profileId: z.coerce.number().int().nonnegative(),
			}),
			data: { profileId: "123" },
		});

		expect(parsed).toEqual({ profileId: 123 });
	});

	it("logs endpoint context before throwing validation errors", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		expect(() =>
			parseApiResponse({
				path: "/v5/chat/conversation/abc/message",
				method: "GET",
				schema: z.object({
					messages: z.array(z.object({ messageId: z.string() })),
				}),
				data: { messages: [{ messageId: 123 }] },
			}),
		).toThrow(z.ZodError);

		expect(consoleError).toHaveBeenCalledWith(
			"API response schema validation failed",
			expect.objectContaining({
				path: "/v5/chat/conversation/abc/message",
				method: "GET",
				response: { messages: [{ messageId: 123 }] },
			}),
		);

		consoleError.mockRestore();
	});
});

describe("schemaMismatchMessage", () => {
	const request = { method: "POST", path: "/v4/inbox", body: undefined };
	const error = new z.ZodError([]);

	it("names the schema when the model registry knows it", () => {
		expect(
			schemaMismatchMessage({
				schema: cascadeV4ResponseSchema,
				error,
				request,
			}),
		).toBe("API response did not match cascadeV4Response");
	});

	it("names the endpoint when the schema is anonymous", () => {
		expect(
			schemaMismatchMessage({
				schema: z.object({ entries: z.array(z.unknown()) }),
				error,
				request,
			}),
		).toBe("API response did not match the schema for POST /v4/inbox");
	});

	it("keeps identifiers and query parameters out of the message", () => {
		expect(
			schemaMismatchMessage({
				schema: z.object({ profiles: z.array(z.unknown()) }),
				error,
				request: {
					method: "GET",
					path: "/v7/profiles/123456789",
					body: undefined,
				},
			}),
		).toBe(
			"API response did not match the schema for GET /v7/profiles/{id}",
		);
	});

	it("keeps query parameters out of the message", () => {
		expect(
			schemaMismatchMessage({
				schema: z.object({ items: z.array(z.unknown()) }),
				error,
				request: {
					method: "GET",
					path: "/v4/cascade?nearbyGeoHash=u33dc0",
					body: undefined,
				},
			}),
		).toBe("API response did not match the schema for GET /v4/cascade");
	});

	it("passes a non-zod error through unchanged", () => {
		expect(
			schemaMismatchMessage({
				schema: z.object({}),
				error: new Error("socket closed"),
				request,
			}),
		).toBe("socket closed");
	});
});
