// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeTextMock, toastMock } = vi.hoisted(() => ({
	writeTextMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const { copyErrorConfirmState } =
	await import("$lib/api/copy-error-confirm-state.svelte");
const { promptCopyError } = await import("$lib/api/error-copy");
const CopyErrorConfirmAlert = (await import("./CopyErrorConfirmAlert.svelte"))
	.default;

const error = new Error("failed for me@example.com");

function copiedText(): string {
	return String(writeTextMock.mock.calls.at(-1)?.[0]);
}

describe("CopyErrorConfirmAlert", () => {
	beforeEach(() => {
		writeTextMock.mockReset().mockResolvedValue(undefined);
		toastMock.success.mockReset();
		toastMock.error.mockReset();
		render(CopyErrorConfirmAlert);
	});

	afterEach(() => {
		cleanup();
		copyErrorConfirmState.open = false;
		copyErrorConfirmState.resolve = null;
	});

	it("hides the popup and reports success once the details are copied", async () => {
		const pending = promptCopyError(error);
		await vi.waitFor(() => screen.getByRole("button", { name: "Copy" }));

		await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await pending;

		expect(copyErrorConfirmState.open).toBe(false);
		expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
		expect(copiedText()).toContain("<email>");
		expect(toastMock.success).toHaveBeenCalledExactlyOnceWith(
			"Error details copied to clipboard",
		);
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("copies unredacted details when the toggle is off", async () => {
		const pending = promptCopyError(error);
		await vi.waitFor(() => screen.getByRole("switch"));

		await fireEvent.click(screen.getByRole("switch"));
		await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await pending;

		expect(copiedText()).toContain("me@example.com");
	});

	it("hides the popup and reports a failed copy", async () => {
		writeTextMock.mockRejectedValue(new Error("no clipboard"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = promptCopyError(error);
		await vi.waitFor(() => screen.getByRole("button", { name: "Copy" }));

		await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
		await pending;

		expect(copyErrorConfirmState.open).toBe(false);
		expect(toastMock.success).not.toHaveBeenCalled();
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Couldn't copy to clipboard",
		);
	});

	it("copies nothing when the popup is dismissed", async () => {
		const pending = promptCopyError(error);
		await vi.waitFor(() => screen.getByRole("button", { name: "Close" }));

		await fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await pending;

		expect(copyErrorConfirmState.open).toBe(false);
		expect(writeTextMock).not.toHaveBeenCalled();
		expect(toastMock.success).not.toHaveBeenCalled();
	});
});
