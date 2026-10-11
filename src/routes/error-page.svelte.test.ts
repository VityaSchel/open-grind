// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyErrorConfirmState } from "$lib/api/copy-error-confirm-state.svelte";
import CopyErrorConfirmAlert from "$lib/components/feedback/CopyErrorConfirmAlert.svelte";
import { handleError } from "../hooks.client";
import ErrorPage from "./+error.svelte";

const { page, writeTextMock, toastMock } = vi.hoisted(() => ({
	page: {
		status: 500,
		error: null as App.Error | null,
		url: new URL("https://app.test/interest"),
	},
	writeTextMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("$app/state", () => ({ page }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

async function confirmCopy(): Promise<void> {
	await fireEvent.click(
		screen.getByRole("button", { name: "Copy error details" }),
	);
	await screen.findByRole("alertdialog", { name: "Copy error details?" });
	await fireEvent.click(screen.getByRole("button", { name: "Copy" }));
}

describe("the unexpected error page", () => {
	beforeEach(() => {
		page.error = { message: "Failed to load for me@example.com" };
		writeTextMock.mockReset().mockResolvedValue(undefined);
		toastMock.success.mockReset();
		toastMock.error.mockReset();
		render(ErrorPage);
		render(CopyErrorConfirmAlert);
	});

	afterEach(() => {
		cleanup();
		copyErrorConfirmState.open = false;
		copyErrorConfirmState.resolve = null;
	});

	it("asks whether to redact the error before copying anything", async () => {
		await fireEvent.click(
			screen.getByRole("button", { name: "Copy error details" }),
		);

		expect(
			await screen.findByRole("alertdialog", {
				name: "Copy error details?",
			}),
		).toBeTruthy();
		expect(writeTextMock).not.toHaveBeenCalled();
		expect(toastMock.success).not.toHaveBeenCalled();
	});

	it("copies the redacted error once the copy is confirmed", async () => {
		await confirmCopy();

		await vi.waitFor(() => {
			expect(toastMock.success).toHaveBeenCalledExactlyOnceWith(
				"Copied to clipboard",
			);
		});
		const copied = String(writeTextMock.mock.calls.at(-1)?.[0]);
		expect(copied).toContain("<email>");
		expect(copied).not.toContain("me@example.com");
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("reports the status and the type of error that broke the page", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		page.error =
			(await handleError({
				error: new TypeError("Cannot read properties of undefined"),
				event: {
					params: {},
					route: { id: "/(protected)/(navbar)/interest" },
					url: page.url,
				},
				status: 500,
				message: "Internal Error",
			})) ?? null;

		await confirmCopy();

		await vi.waitFor(() => {
			expect(writeTextMock).toHaveBeenCalledOnce();
		});
		expect(JSON.parse(String(writeTextMock.mock.calls[0]?.[0]))).toEqual({
			message: "Internal Error",
			type: "TypeError",
			status: 500,
		});
	});

	it("reports a copy the clipboard refuses instead of claiming it copied", async () => {
		writeTextMock.mockRejectedValue(new Error("no clipboard"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		await confirmCopy();

		await vi.waitFor(() => {
			expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
				"Couldn’t copy to clipboard",
			);
		});
		expect(writeTextMock).toHaveBeenCalledOnce();
		expect(toastMock.success).not.toHaveBeenCalled();
	});
});
