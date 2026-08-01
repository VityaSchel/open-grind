import { beforeEach, describe, expect, it, vi } from "vitest";

import { signOutIfSessionLost } from "$lib/api/session-lost";

const { page, callMethodMock, signOutMock } = vi.hoisted(() => ({
	page: { route: { id: "/(protected)/chat" } },
	callMethodMock: vi.fn(),
	signOutMock: vi.fn(),
}));

vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));

describe("signOutIfSessionLost", () => {
	beforeEach(() => {
		page.route.id = "/(protected)/chat";
		callMethodMock.mockReset().mockResolvedValue(null);
		signOutMock.mockReset().mockResolvedValue(undefined);
	});

	it("signs out when the app is open and the backend has no session", async () => {
		await signOutIfSessionLost();

		expect(signOutMock).toHaveBeenCalledOnce();
	});

	it("leaves the signed-out screens alone", async () => {
		page.route.id = "/auth/sign-in";

		await signOutIfSessionLost();

		expect(callMethodMock).not.toHaveBeenCalled();
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("keeps the session when the backend still has one", async () => {
		callMethodMock.mockResolvedValue(123);

		await signOutIfSessionLost();

		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("signs out once for a burst of failed requests", async () => {
		await Promise.all([
			signOutIfSessionLost(),
			signOutIfSessionLost(),
			signOutIfSessionLost(),
		]);

		expect(signOutMock).toHaveBeenCalledOnce();
	});

	it("retries after a failed sign-out", async () => {
		signOutMock.mockRejectedValueOnce(new Error("keyring locked"));

		await expect(signOutIfSessionLost()).rejects.toThrow("keyring locked");
		await signOutIfSessionLost();

		expect(signOutMock).toHaveBeenCalledTimes(2);
	});
});
