import { describe, expect, it, vi } from "vitest";
import z from "zod";

import { parseApiResponse } from "$lib/api/transport";

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
