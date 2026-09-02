// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DesktopEntryAlert from "./DesktopEntryAlert.svelte";

const { invokeMock, toastMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: invokeMock,
	isTauri: () => true,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function offering(offered: boolean) {
	invokeMock.mockImplementation((command: string) =>
		command === "desktop_entry_offer"
			? Promise.resolve(offered)
			: Promise.resolve(),
	);
}

describe("DesktopEntryAlert", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		toastMock.success.mockReset();
		toastMock.error.mockReset();
	});

	afterEach(cleanup);

	it("stays out of the way when the app was not started from an AppImage", async () => {
		offering(false);

		render(DesktopEntryAlert);
		await settle();

		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("asks once the backend says the entry is missing", async () => {
		offering(true);

		render(DesktopEntryAlert);
		await settle();

		expect(screen.getByRole("alertdialog")).not.toBeNull();
	});

	it("writes the entry when the offer is accepted", async () => {
		offering(true);
		render(DesktopEntryAlert);
		await settle();

		await fireEvent.click(screen.getByText("Add"));
		await settle();

		expect(invokeMock).toHaveBeenCalledWith("desktop_entry_install");
		expect(toastMock.success).toHaveBeenCalled();
	});

	it("remembers a refusal so the next launch stays quiet", async () => {
		offering(true);
		render(DesktopEntryAlert);
		await settle();

		await fireEvent.click(screen.getByText("No thanks"));
		await settle();

		expect(invokeMock).toHaveBeenCalledWith("desktop_entry_dismiss");
		expect(invokeMock).not.toHaveBeenCalledWith("desktop_entry_install");
	});

	it("says so when the entry cannot be written", async () => {
		invokeMock.mockImplementation((command: string) =>
			command === "desktop_entry_offer"
				? Promise.resolve(true)
				: Promise.reject(new Error("read-only home")),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(DesktopEntryAlert);
		await settle();

		await fireEvent.click(screen.getByText("Add"));
		await settle();

		expect(toastMock.error).toHaveBeenCalled();
		expect(toastMock.success).not.toHaveBeenCalled();
	});
});
