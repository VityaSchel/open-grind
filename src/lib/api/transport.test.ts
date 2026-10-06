import { encode } from "@msgpack/msgpack";
import { afterEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { ApiError } from "$lib/api/api-error";
import {
	fetchRest,
	parseApiResponse,
	schemaMismatchMessage,
} from "$lib/api/transport";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
import { toBase64 } from "$lib/util/base64";

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

describe("jsonParsed", () => {
	it("rejects a failed status even when the body matches the schema", async () => {
		invokeMock.mockResolvedValue(
			toBase64(
				encode({ status: 404, body: new TextEncoder().encode("{}") }),
			),
		);

		const response = await fetchRest("/v7/profiles/1");

		expect(() => response.jsonParsed(z.object({}).loose())).toThrow(
			expect.objectContaining({
				response: expect.objectContaining({ status: 404 }),
			}),
		);
	});

	it("reports a failed status instead of a schema mismatch", async () => {
		const body = { type: "urn:gr:err:internal_error", status: 500 };
		invokeMock.mockResolvedValue(
			toBase64(
				encode({
					status: 500,
					body: new TextEncoder().encode(JSON.stringify(body)),
				}),
			),
		);

		const response = await fetchRest("/v4/cascade?genders=62");
		const error = (() => {
			try {
				response.jsonParsed(cascadeV4ResponseSchema);
			} catch (thrown) {
				return thrown;
			}
		})();

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			message: "API request failed with status 500",
			response: { status: 500 },
			retryable: true,
		});
	});
});

describe("fetchRest", () => {
	afterEach(() => setLocale({ locale: SOURCE_LOCALE }));

	it("keeps a backend failure's message English for error reports", async () => {
		await setLocale({ locale: "en-XA" });
		invokeMock.mockRejectedValue({ kind: "RateLimited" });

		await expect(fetchRest("/v4/cascade")).rejects.toMatchObject({
			kind: "RateLimited",
			message: "Grindr is rate limiting us",
		});
	});
});
