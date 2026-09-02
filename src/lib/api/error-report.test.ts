import { describe, expect, it } from "vitest";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import { errorReport } from "$lib/api/error-report";

const gridError = () =>
	new ApiError({
		message:
			"error sending request for url (https://grindr.mobi/v4/cascade?nearbyGeoHash=u4pruydqqvj8&rightNow=true)",
		request: {
			method: "GET",
			path: "/v4/cascade?nearbyGeoHash=u4pruydqqvj8&rightNow=true&sexualHealth=4",
		},
		response: {
			status: 200,
			body: '{"items":[{"profileId":123,"distanceMeters":41}]}',
		},
		kind: "Http",
	});

describe("errorReport of an ApiError", () => {
	it("redacts location and filters and structures the response", () => {
		expect(errorReport(gridError(), { redact: true })).toEqual({
			error: "error sending request for url (https://grindr.mobi/v4/cascade?nearbyGeoHash=u4**********&rightNow={boolean})",
			kind: "Http",
			request: {
				method: "GET",
				path: "/v4/cascade?nearbyGeoHash=u4**********&rightNow={boolean}&sexualHealth={number}",
			},
			response: {
				status: 200,
				body: {
					items: [
						{ profileId: "<number>", distanceMeters: "<number>" },
					],
				},
			},
		});
	});

	it("never emits a full-precision geohash", () => {
		expect(
			JSON.stringify(errorReport(gridError(), { redact: true })),
		).not.toContain("u4pruydqqvj8");
	});

	it("redacts the request body", () => {
		const report = errorReport(
			new ApiError({
				message: "API request failed with status 500",
				request: {
					method: "POST",
					path: "/v4/chat/message/send",
					body: {
						type: "Text",
						target: { type: "Direct", targetId: 123456789 },
						body: { text: "see you at mine" },
					},
				},
			}),
			{ redact: true },
		) as { request: { body: unknown } };

		expect(report.request.body).toEqual({
			type: "Text",
			target: { type: "Direct", targetId: "<number>" },
			body: { text: "<string:15>" },
		});
	});

	it("omits the body key entirely when the request had none", () => {
		const report = errorReport(gridError(), { redact: true }) as {
			request: Record<string, unknown>;
		};
		expect("body" in report.request).toBe(false);
	});

	it("keeps a null response null", () => {
		const report = errorReport(
			new ApiError({
				message: "Not logged in",
				request: { method: "GET", path: "/v4/me/profile" },
				kind: "Auth",
			}),
			{ redact: true },
		) as { response: unknown };
		expect(report.response).toBeNull();
	});

	it("returns everything unredacted when redaction is skipped", () => {
		const error = gridError();
		expect(errorReport(error, { redact: false })).toEqual({
			error: error.message,
			kind: "Http",
			request: error.request,
			response: {
				status: 200,
				body: { items: [{ profileId: 123, distanceMeters: 41 }] },
			},
		});
	});
});

describe("errorReport of a schema mismatch", () => {
	const mismatch = () => {
		const schema = z.object({
			items: z.array(z.object({ profileId: z.number() })),
		});
		const parsed = schema.safeParse({ items: [{ profileId: "12" }] });
		return new ApiError({
			message: "API response did not match cascadeV4Response",
			request: { method: "GET", path: "/v4/cascade" },
			response: { status: 200, body: '{"items":[{"profileId":"12"}]}' },
			cause: parsed.error,
		});
	};

	const lateMismatch = () => {
		const schema = z.object({
			items: z.array(z.object({ type: z.literal("known") })),
		});
		const items = Array.from({ length: 120 }, (_item, index) => ({
			type: index === 87 ? "brand_new" : "known",
		}));
		const body = JSON.stringify({ items });
		return new ApiError({
			message: "API response did not match cascadeV4Response",
			request: { method: "GET", path: "/v4/cascade" },
			response: { status: 200, body },
			cause: schema.safeParse(JSON.parse(body)).error,
		});
	};

	it("names the value that violated a closed set", () => {
		const schema = z.object({
			profiles: z.array(
				z.object({ sexualHealth: z.array(z.enum({ A: 1, B: 2 })) }),
			),
		});
		const body = { profiles: [{ sexualHealth: [1, 6] }] };
		const error = new ApiError({
			message:
				"API response did not match the schema for GET /v7/profiles/{id}",
			request: { method: "GET", path: "/v7/profiles/1" },
			response: { status: 200, body: JSON.stringify(body) },
			cause: schema.safeParse(body).error,
		});

		const report = errorReport(error, { redact: true }) as {
			issues: { path: string; received?: unknown }[];
		};

		expect(report.issues[0]).toMatchObject({
			path: "profiles[0].sexualHealth[1]",
			received: 6,
		});
	});

	it("keeps masking the value for issues that are not closed-set violations", () => {
		const schema = z.object({ aboutMe: z.number() });
		const body = { aboutMe: "something personal" };
		const error = new ApiError({
			message:
				"API response did not match the schema for GET /v7/profiles/{id}",
			request: { method: "GET", path: "/v7/profiles/1" },
			response: { status: 200, body: JSON.stringify(body) },
			cause: schema.safeParse(body).error,
		});

		const report = errorReport(error, { redact: true }) as {
			issues: { path: string; received?: unknown }[];
		};

		expect(report.issues[0]).toMatchObject({
			path: "aboutMe",
			received: "<string:18>",
		});
	});

	it("keeps the array entry an issue blames, past the head window", () => {
		const report = errorReport(lateMismatch(), { redact: true }) as {
			response: { body: { items: unknown[] } };
		};
		const { items } = report.response.body;

		expect(items).toHaveLength(13);
		expect(items.slice(0, 10)).toEqual(
			Array.from({ length: 10 }, () => ({ type: "known" })),
		);
		expect(items[10]).toBe("<+77 more>");
		expect(items[11]).toEqual({ type: "brand_new" });
		expect(items[12]).toBe("<+32 more>");
	});

	it("lifts the issues out of the cause instead of nesting a JSON string", () => {
		const report = errorReport(mismatch(), { redact: true }) as {
			error: string;
			issues: { path: string; code: string; expected: string }[];
			cause?: unknown;
		};

		expect(report.error).toBe(
			"API response did not match cascadeV4Response",
		);
		expect(report.issues).toEqual([
			{
				path: "items[0].profileId",
				received: "<string:2>",
				code: "invalid_type",
				expected: "number",
				message: "Invalid input: expected number, received string",
			},
		]);
		expect(report.cause).toBeUndefined();
	});

	it("names the alternatives a discriminated union offered", () => {
		const schema = z.discriminatedUnion("type", [
			z.object({ type: z.literal("Text") }),
			z.object({ type: z.literal("Image") }),
		]);
		const parsed = schema.safeParse({ type: "Nope" });

		const report = errorReport(parsed.error, { redact: true }) as {
			issues: { options: string[]; discriminator: string }[];
		};

		expect(report.issues[0]?.options).toEqual(["Text", "Image"]);
		expect(report.issues[0]?.discriminator).toBe("type");
	});

	it("drops the value that failed even if zod was asked to report it", () => {
		const parsed = z
			.object({ aboutMe: z.number() })
			.safeParse({ aboutMe: "looking for fun" }, { reportInput: true });

		expect(
			JSON.stringify(errorReport(parsed.error, { redact: true })),
		).not.toContain("looking for fun");
	});
});

describe("errorReport of a thrown Error", () => {
	it("keeps the frames and scrubs the message", () => {
		const error = new Error(
			"Failed to load video: https://cdns.grindr.com/videos/9f3a1c0b.mp4",
		);
		error.stack = `Error: ${error.message}\n    at load (http://tauri.localhost/_app/immutable/nodes/20.0gtofmUf.js:3:17903)`;

		expect(errorReport(error, { redact: true })).toEqual({
			error: "Failed to load video: https://cdns.grindr.com/videos/{id}",
			stack:
				"Error: Failed to load video: https://cdns.grindr.com/videos/{id}\n" +
				"    at load (http://tauri.localhost/_app/immutable/nodes/20.0gtofmUf.js:3:17903)",
		});
	});

	it("follows the cause down to the request that actually failed", () => {
		const wrapper = new Error("Failed to fetch profiles", {
			cause: new ApiError({
				message: "API request failed with status 500",
				request: { method: "GET", path: "/v7/profiles/123456789" },
				response: {
					status: 500,
					body: '{"code":4,"message":"Server error"}',
				},
			}),
		});
		wrapper.stack = "Error: Failed to fetch profiles";

		const report = errorReport(wrapper, { redact: true }) as {
			cause: { request: unknown };
		};

		expect(report.cause).toMatchObject({
			error: "API request failed with status 500",
			request: { method: "GET", path: "/v7/profiles/{id}" },
			response: {
				status: 500,
				body: { code: 4, message: "Server error" },
			},
		});
	});

	it("stops following a cause chain that never ends", () => {
		const first = new Error("first");
		const second = new Error("second", { cause: first });
		Object.defineProperty(first, "cause", { value: second });

		expect(() =>
			JSON.stringify(errorReport(second, { redact: true })),
		).not.toThrow();
	});
});

describe("errorReport of a value that is not an Error", () => {
	it("reads a backend error object instead of stringifying it to [object Object]", () => {
		expect(
			errorReport(
				{ kind: "Auth", message: "Not logged in" },
				{ redact: true },
			),
		).toEqual({ kind: "Auth", message: "Not logged in" });
	});

	it("wraps a primitive", () => {
		expect(errorReport("something broke", { redact: true })).toEqual({
			error: "something broke",
		});
	});
});
