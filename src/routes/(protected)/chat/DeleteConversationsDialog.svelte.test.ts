// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";

const DESCRIPTION = '[data-slot="alert-dialog-description"]';

async function openDialog({ count, title }: { count: number; title: string }) {
	const onConfirm = vi.fn();
	render(DeleteConversationsDialog, { open: true, count, onConfirm });
	const dialog = await screen.findByRole("alertdialog", { name: title });
	const description = dialog.querySelector(DESCRIPTION)?.textContent;
	return { onConfirm, description: description?.trim() };
}

describe("DeleteConversationsDialog", () => {
	afterEach(cleanup);

	it("asks about one conversation without a number", async () => {
		const { description } = await openDialog({
			count: 1,
			title: "Delete conversation?",
		});

		expect(description).toBe(
			"This conversation will be deleted for you only. This can’t be undone.",
		);
	});

	it("counts several conversations", async () => {
		const { description } = await openDialog({
			count: 3,
			title: "Delete 3 conversations?",
		});

		expect(description).toBe(
			"These conversations will be deleted for you only. This can’t be undone.",
		);
	});

	it("confirms with Delete next to Cancel", async () => {
		const { onConfirm } = await openDialog({
			count: 3,
			title: "Delete 3 conversations?",
		});
		expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

		await fireEvent.click(screen.getByRole("button", { name: "Delete" }));

		expect(onConfirm).toHaveBeenCalledOnce();
	});
});
