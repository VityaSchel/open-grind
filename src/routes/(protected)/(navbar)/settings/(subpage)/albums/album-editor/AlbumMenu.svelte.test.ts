// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { api, errorToast, sonner } = vi.hoisted(() => ({
	api: { deleteAlbum: vi.fn<() => Promise<void>>() },
	errorToast: { showErrorToast: vi.fn() },
	sonner: { toast: { success: vi.fn() } },
}));

vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("$lib/api/error-toast", () => errorToast);
vi.mock("svelte-sonner", () => sonner);
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import { clearAccountCaches } from "$lib/api/account-caches";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AlbumMenu from "./AlbumMenu.svelte";

const ALBUM_ID = 900;

function renderMenu(): HTMLElement {
	render(AlbumMenu, { props: { albumId: ALBUM_ID, ourProfileId: 1 } });
	return screen.getByRole("button");
}

async function openMenu(trigger: HTMLElement): Promise<HTMLElement> {
	await fireEvent.keyDown(trigger, { key: "Enter" });
	const [deleteItem] = await screen.findAllByRole("menuitem", {
		hidden: true,
	});
	if (deleteItem === undefined) throw new Error("no menu item");
	return deleteItem;
}

async function confirmDialog(deleteItem: HTMLElement): Promise<HTMLElement> {
	await fireEvent.click(deleteItem);
	return screen.findByRole("alertdialog");
}

async function confirmDelete(dialog: HTMLElement): Promise<void> {
	const [, confirm] = within(dialog).getAllByRole("button");
	if (confirm === undefined) throw new Error("no confirm button");
	await fireEvent.click(confirm);
}

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	clearAccountCaches();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album menu", () => {
	it("deletes the album only after confirming", async () => {
		api.deleteAlbum.mockResolvedValue(undefined);
		const trigger = renderMenu();
		expect(trigger.getAttribute("aria-label")).toBe("Album menu");
		const deleteItem = await openMenu(trigger);
		expect(deleteItem.textContent.trim()).toBe("Delete album");

		const dialog = await confirmDialog(deleteItem);
		expect(
			screen.getByRole("alertdialog", {
				name: "Delete album?",
				description:
					"This album and everything in it will be deleted, and anyone you shared it with will lose access. This can’t be undone.",
			}),
		).toBe(dialog);
		expect(api.deleteAlbum).not.toHaveBeenCalled();
		await fireEvent.click(
			within(dialog).getByRole("button", { name: "Delete" }),
		);

		expect(api.deleteAlbum).toHaveBeenCalledWith({ albumId: ALBUM_ID });
		await vi.waitFor(() =>
			expect(sonner.toast.success).toHaveBeenCalledWith(
				"Your album has been deleted",
			),
		);
	});

	it("says when the album could not be deleted", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new Error("HTTP 500");
		api.deleteAlbum.mockRejectedValue(failure);

		await confirmDelete(await confirmDialog(await openMenu(renderMenu())));

		await vi.waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledWith({
				label: "Couldn’t delete album",
				error: failure,
			}),
		);
	});

	it("words its menu, dialog and toasts in the active locale", async () => {
		api.deleteAlbum.mockResolvedValue(undefined);
		const trigger = renderMenu();

		await setLocale({ locale: "en-XA" });

		expect(trigger.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		const deleteItem = await openMenu(trigger);
		expect(deleteItem.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		const dialog = await confirmDialog(deleteItem);
		expect(
			screen.getByRole("alertdialog", {
				name: PSEUDO_MESSAGE,
				description: PSEUDO_MESSAGE,
			}),
		).toBe(dialog);
		for (const button of within(dialog).getAllByRole("button")) {
			expect(button.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
		await confirmDelete(dialog);
		await vi.waitFor(() =>
			expect(sonner.toast.success).toHaveBeenCalledWith(
				expect.stringMatching(PSEUDO_MESSAGE),
			),
		);
	});
});
