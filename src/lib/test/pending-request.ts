import type { Mock } from "vitest";

type StubResponse = { assertOk: () => void; jsonParsed: () => unknown };

function stubResponse({
	ok,
	body,
}: {
	ok: boolean;
	body?: unknown;
}): StubResponse {
	const assertOk = () => {
		if (!ok) throw new Error("API request failed with status 500");
	};
	return {
		assertOk,
		jsonParsed: () => {
			assertOk();
			return body;
		},
	};
}

export function pendingRequest(fetchRest: Mock) {
	const response = Promise.withResolvers<StubResponse>();
	fetchRest.mockReturnValueOnce(response.promise);
	return {
		succeed: (body?: unknown) =>
			response.resolve(stubResponse({ ok: true, body })),
		fail: () => response.resolve(stubResponse({ ok: false })),
	};
}
