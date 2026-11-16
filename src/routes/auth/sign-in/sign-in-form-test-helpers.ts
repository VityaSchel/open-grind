import { fireEvent, screen } from "@testing-library/svelte";
import { expect, vi } from "vitest";

export const callMethodMock = vi.fn();
export const fetchRestMock = vi.fn();
export const gotoMock = vi.fn();
export const openExternalLinkMock = vi.fn();
export const toastMock = { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() };
export const addonMock = {
	addonInstallerAvailable: vi.fn(),
	addonPublishedHere: vi.fn(),
	installNow: vi.fn(),
};

export const invalidCredentials = {
	kind: "Api",
	message: { code: 4, message: "Invalid input parameters" },
};

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export function resetSignInMocks() {
	callMethodMock.mockReset();
	fetchRestMock.mockReset();
	gotoMock.mockReset();
	toastMock.error.mockReset();
	openExternalLinkMock.mockReset();
	addonMock.addonInstallerAvailable.mockReset().mockReturnValue(true);
	addonMock.addonPublishedHere.mockReset().mockResolvedValue(true);
	addonMock.installNow.mockReset().mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => {});
}

export async function submitSignIn() {
	await fireEvent.input(screen.getByLabelText("Email"), {
		target: { value: "someone@example.com" },
	});
	await fireEvent.input(screen.getByLabelText("Password"), {
		target: { value: "hunter2" },
	});
	await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
	await settle();
}

export function expectReady() {
	const button = screen.getByRole("button", { name: "Sign in" });
	expect(button).toHaveProperty("disabled", false);
	expect(button.getAttribute("aria-busy")).toBe("false");
}
