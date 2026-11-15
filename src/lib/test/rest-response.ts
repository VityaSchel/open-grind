import type { Mock } from "vitest";
import type { ZodType } from "zod";

import { ApiError } from "#lib/api/api-error.ts";

export function restResponse({
	status = 200,
	body = null,
}: { status?: number; body?: unknown } = {}) {
	const text = () => JSON.stringify(body);
	const assertOk = () => {
		if (status < 200 || status >= 300)
			throw new ApiError({
				message: `API request failed with status ${status}`,
				request: { method: "GET", path: "/" },
				response: { status, body: text() },
			});
	};
	return {
		status,
		text,
		assertOk,
		jsonParsed: (schema: ZodType) => {
			assertOk();
			return schema.parse(body);
		},
	};
}

export function requestsOf(fetchRest: Mock) {
	return fetchRest.mock.calls.map(([path, options]) => ({
		path,
		method: options?.method ?? "GET",
		body: options?.body,
	}));
}
