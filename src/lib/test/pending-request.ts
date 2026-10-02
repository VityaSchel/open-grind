import type { Mock } from "vitest";

export function pendingRequest(fetchRest: Mock) {
	const response = Promise.withResolvers<{ assertOk: () => void }>();
	fetchRest.mockReturnValueOnce(response.promise);
	return {
		succeed: () => response.resolve({ assertOk: () => {} }),
		fail: () =>
			response.resolve({
				assertOk: () => {
					throw new Error("API request failed with status 500");
				},
			}),
	};
}
