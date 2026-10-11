// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { rightClick } from "$lib/test/context-menu";

const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("$lib/api/error-toast", () => errorToast);

import PreviousUploadsSheet from "./PreviousUploadsSheet.svelte";

type Upload = { id: number; video: boolean };

const photo = (id: number): Upload => ({ id, video: false });
const video = (id: number): Upload => ({ id, video: true });

function renderSheet({
	uploads,
	max = 10,
	onUpload = vi.fn(),
	onDelete = vi.fn(() => Promise.resolve()),
	onSubmit = vi.fn(() => Promise.resolve(true)),
}: {
	uploads: Upload[];
	max?: number | null;
	onUpload?: () => void;
	onDelete?: (item: Upload) => Promise<void>;
	onSubmit?: (items: Upload[]) => Promise<boolean>;
}) {
	return render(PreviousUploadsSheet<Upload>, {
		props: {
			open: true,
			uploadLabel: "Upload photos or videos",
			submitLabel: "Add to album",
			max,
			load: () => Promise.resolve(uploads),
			describe: (item: Upload) => ({
				key: item.id,
				src: `https://example.invalid/${item.id}`,
				video: item.video,
			}),
			onUpload,
			onDelete,
			onSubmit,
		},
	});
}

function openMenuLabels(): (string | null)[] {
	return [...document.querySelectorAll("dialog[open]")].map(
		(dialog) =>
			dialog.querySelector("[role='menu']")?.getAttribute("aria-label") ??
			null,
	);
}

function holdCloseEvent(dialog: HTMLDialogElement): () => void {
	let fire = () => {};
	dialog.close = () => {
		dialog.open = false;
		fire = () => dialog.dispatchEvent(new Event("close"));
	};
	return () => fire();
}

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("previous uploads sheet", () => {
	it("hands off to the picker from the upload tile and closes", async () => {
		const onUpload = vi.fn();
		const { findByRole, queryByRole } = renderSheet({
			uploads: [photo(1)],
			onUpload,
		});

		await fireEvent.click(
			await findByRole("button", { name: "Upload photos or videos" }),
		);

		expect(onUpload).toHaveBeenCalledOnce();
		await vi.waitFor(() =>
			expect(
				queryByRole("dialog", { name: "Previous Uploads" }),
			).toBeNull(),
		);
	});

	it("adds the chosen uploads in the order the sheet lists them", async () => {
		const onSubmit = vi.fn(() => Promise.resolve(true));
		const { findByRole, getByRole } = renderSheet({
			uploads: [photo(1), photo(2), photo(3)],
			onSubmit,
		});

		await fireEvent.click(await findByRole("button", { name: "Photo 3" }));
		await fireEvent.click(getByRole("button", { name: "Photo 1" }));
		await fireEvent.click(getByRole("button", { name: /Add to album/ }));

		expect(onSubmit).toHaveBeenCalledWith([photo(1), photo(3)]);
	});

	it("stays open with the selection when adding fails", async () => {
		const { findByRole, getByRole } = renderSheet({
			uploads: [photo(1)],
			onSubmit: () => Promise.resolve(false),
		});

		await fireEvent.click(await findByRole("button", { name: "Photo 1" }));
		await fireEvent.click(getByRole("button", { name: /Add to album/ }));

		await vi.waitFor(() =>
			expect(
				getByRole("button", { name: /Add to album/ }),
			).toHaveProperty("disabled", false),
		);
		expect(
			getByRole("button", { name: "Photo 1" }).getAttribute(
				"aria-pressed",
			),
		).toBe("true");
	});

	it("stops selecting at the room left", async () => {
		const { findByRole, getByRole } = renderSheet({
			uploads: [photo(1), photo(2)],
			max: 1,
		});

		await fireEvent.click(await findByRole("button", { name: "Photo 1" }));
		await fireEvent.click(getByRole("button", { name: "Photo 2" }));

		expect(
			getByRole("button", { name: "Photo 2" }).getAttribute(
				"aria-pressed",
			),
		).toBe("false");
	});

	it("deletes an upload for good only after confirming", async () => {
		const onDelete = vi.fn(() => Promise.resolve());
		const { findByRole, getByRole, queryByRole } = renderSheet({
			uploads: [photo(1), video(2)],
			onDelete,
		});

		await rightClick(await findByRole("button", { name: "Video 2" }));
		await fireEvent.click(
			await findByRole("menuitem", { name: "Delete permanently" }),
		);
		expect(onDelete).not.toHaveBeenCalled();
		expect(
			await findByRole("alertdialog", { name: "Delete this video?" }),
		).toBeTruthy();
		await fireEvent.click(getByRole("button", { name: "Delete" }));

		expect(onDelete).toHaveBeenCalledWith(video(2));
		await vi.waitFor(() =>
			expect(queryByRole("button", { name: "Video 2" })).toBeNull(),
		);
		expect(getByRole("button", { name: "Photo 1" })).toBeTruthy();
	});

	it("reopens a tile's menu asked for again while it is still closing", async () => {
		const { findByRole } = renderSheet({ uploads: [photo(1), video(2)] });
		const tile = await findByRole("button", { name: "Video 2" });

		await rightClick(tile);
		const closing = document.querySelector("dialog[open]");
		if (!(closing instanceof HTMLDialogElement))
			throw new Error("the menu did not open");
		const fireCloseEvent = holdCloseEvent(closing);
		await fireEvent.mouseDown(closing);
		await rightClick(tile);
		fireCloseEvent();
		await tick();

		expect(openMenuLabels()).toEqual(["Video options"]);
	});

	it("keeps an upload the server refused to delete and says so", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new Error("HTTP 500");
		const { findByRole, getByRole } = renderSheet({
			uploads: [photo(1)],
			onDelete: () => Promise.reject(failure),
		});

		await rightClick(await findByRole("button", { name: "Photo 1" }));
		await fireEvent.click(
			await findByRole("menuitem", { name: "Delete permanently" }),
		);
		await fireEvent.click(await findByRole("button", { name: "Delete" }));

		await vi.waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledWith({
				label: "Couldn’t delete photo",
				error: failure,
			}),
		);
		expect(getByRole("button", { name: "Photo 1" })).toBeTruthy();
	});

	it("words its tiles, tile menu and delete dialog in the active locale", async () => {
		const { findByRole, getAllByRole, getByRole } = renderSheet({
			uploads: [photo(1), video(2)],
		});
		await findByRole("button", { name: "Video 2" });

		await setLocale({ locale: "en-XA" });

		const tiles = getAllByRole("button", { name: PSEUDO_MESSAGE });
		expect(tiles).toHaveLength(2);
		await rightClick(tiles[1]!);
		expect(await findByRole("menu", { name: PSEUDO_MESSAGE })).toBeTruthy();
		await fireEvent.click(getByRole("menuitem", { name: PSEUDO_MESSAGE }));
		const dialog = await findByRole("alertdialog", {
			name: PSEUDO_MESSAGE,
			description: PSEUDO_MESSAGE,
		});
		for (const button of within(dialog).getAllByRole("button")) {
			expect(button.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});

	it("announces a full selection in the active locale", async () => {
		const { findByRole, getByRole } = renderSheet({
			uploads: [photo(1), photo(2)],
			max: 2,
		});

		await fireEvent.click(await findByRole("button", { name: "Photo 1" }));
		expect(getByRole("status").textContent.trim()).toBe("");
		await fireEvent.click(getByRole("button", { name: "Photo 2" }));
		expect(getByRole("status").textContent.trim()).toBe(
			"Maximum 2 selected",
		);

		await setLocale({ locale: "en-XA" });

		expect(getByRole("status").textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});

	it("titles the sheet and its empty state in the active locale", async () => {
		const { findByRole, findByText } = renderSheet({ uploads: [] });
		expect(
			await findByRole("dialog", { name: "Previous Uploads" }),
		).toBeTruthy();
		const emptyTitle = await findByText("No Previous Uploads");

		await setLocale({ locale: "en-XA" });

		expect(
			await findByRole("dialog", { name: PSEUDO_MESSAGE }),
		).toBeTruthy();
		expect(emptyTitle.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});
});
