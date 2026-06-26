import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api")>()),
	fetchRest: fetchRestMock,
}));

import { addFavoriteUser, removeFavoriteUser } from "$lib/api/users/favorites";

const assertOk = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk });
});

describe("favorites API wrappers", () => {
	it("adds favorites and asserts the response status", async () => {
		await addFavoriteUser({ profileId: 42 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v3/me/favorites/42", {
			method: "POST",
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("removes favorites and asserts the response status", async () => {
		await removeFavoriteUser({ profileId: 42 });

		expect(fetchRestMock).toHaveBeenCalledWith("/v3/me/favorites/42", {
			method: "DELETE",
		});
		expect(assertOk).toHaveBeenCalledOnce();
	});
});
