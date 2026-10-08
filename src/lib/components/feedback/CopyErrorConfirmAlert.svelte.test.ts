// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

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

const WARNING = "Be mindful of what you share on the internet!";
const REDACT_LABEL = "Redact sensitive info (recommended)";

function copiedText(): string {
	return String(writeTextMock.mock.calls.at(-1)?.[0]);
}

async function openDescription(): Promise<Element> {
	void promptCopyError(error);
	const dialog = await screen.findByRole("alertdialog", {
		name: "Copy error details?",
	});
	const description = dialog.querySelector(
		'[data-slot="alert-dialog-description"]',
	);
	if (description === null) throw new Error("no dialog description");
	return description;
}

describe("CopyErrorConfirmAlert", () => {
	beforeEach(() => {
		writeTextMock.mockReset().mockResolvedValue(undefined);
		toastMock.success.mockReset();
		toastMock.error.mockReset();
		render(CopyErrorConfirmAlert);
	});

	afterEach(async () => {
		cleanup();
		copyErrorConfirmState.open = false;
		copyErrorConfirmState.resolve = null;
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("warns in bold that the details might hold personal data", async () => {
		const description = await openDescription();

		expect(description.textContent).toBe(
			`${WARNING} The error might contain your personal data. Only copy it unredacted if a developer asks you to.`,
		);
		expect(
			[...description.querySelectorAll("b")].map(
				(bold) => bold.textContent,
			),
		).toStrictEqual([WARNING]);
		expect(description.children).toHaveLength(2);
		expect(screen.getByRole("switch", { name: REDACT_LABEL })).toBeTruthy();
	});

	it("words the confirmation in the active locale", async () => {
		const description = await openDescription();
		const title = screen.getByText("Copy error details?");
		const controls = [
			screen.getByText(REDACT_LABEL),
			screen.getByRole("button", { name: "Copy" }),
			screen.getByRole("button", { name: "Close" }),
		];

		await setLocale({ locale: "en-XA" });

		const lines = [title, description, ...controls].map(
			(node) => node.textContent,
		);
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
		const warning = description.querySelector("b")?.textContent ?? "";
		expect(warning).not.toBe(WARNING);
		expect(description.textContent.startsWith(`${warning} ⟦`)).toBe(true);
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
