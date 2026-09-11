import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMock, renameMock, reorderMock, forgetMock } = vi.hoisted(() => ({
	deleteMock: vi.fn(),
	renameMock: vi.fn(),
	reorderMock: vi.fn(),
	forgetMock: vi.fn(),
}));

vi.mock("$lib/api/messaging/albums", () => ({
	deleteAlbumContent: deleteMock,
	renameAlbum: renameMock,
	reorderAlbumContent: reorderMock,
}));
vi.mock("$lib/components/album/album-lightbox", () => ({
	forgetAlbumSlides: forgetMock,
}));

import type { AlbumContent } from "$lib/model/messaging/albums";
import { AlbumDraft } from "./album-draft.svelte";

const ALBUM_ID = 903;

function item(contentId: number): AlbumContent {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: null,
		statusId: 1,
		thumbUrl: `https://example.invalid/${contentId}`,
		url: `https://example.invalid/${contentId}`,
		processing: false,
		rejectionId: null,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function draftOf(content: number[], albumName: string | null = "Studio") {
	return new AlbumDraft({
		albumId: ALBUM_ID,
		albumName,
		updatedAt: "2026-09-01T10:00:00",
		content: content.map(item),
	});
}

const ids = (draft: AlbumDraft) => draft.content.map((one) => one.contentId);

beforeEach(() => {
	deleteMock.mockReset().mockResolvedValue(undefined);
	renameMock.mockReset().mockResolvedValue(undefined);
	reorderMock.mockReset().mockResolvedValue(undefined);
	forgetMock.mockReset();
});

describe("AlbumDraft", () => {
	it("stays clean until something actually changes", () => {
		const draft = draftOf([1, 2, 3]);
		expect(draft.dirty).toBe(false);
		draft.toggleRemoved(2);
		expect(draft.dirty).toBe(true);
		draft.toggleRemoved(2);
		expect(draft.dirty, "undoing the mark is not a change").toBe(false);
	});

	it("keeps a marked item in the grid but out of the count", () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		expect(ids(draft)).toEqual([1, 2, 3]);
		expect(draft.remaining.map((one) => one.contentId)).toEqual([1, 3]);
	});

	it("deletes, reorders and renames in one save", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		draft.move({ from: 0, to: 2 });
		draft.name = "Darkroom";
		await draft.save();

		expect(deleteMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentId: 2,
		});
		expect(reorderMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentIds: [3, 1],
		});
		expect(renameMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			albumName: "Darkroom",
		});
		expect(draft.dirty).toBe(false);
	});

	it("does not re-issue a delete that already landed", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		draft.move({ from: 0, to: 2 });
		reorderMock.mockRejectedValueOnce(new Error("500"));

		await expect(draft.save()).rejects.toThrow("500");
		expect(draft.dirty, "the reorder is still outstanding").toBe(true);

		await draft.save();
		expect(deleteMock, "the delete was not repeated").toHaveBeenCalledTimes(
			1,
		);
		expect(draft.dirty).toBe(false);
	});

	it("forgets cached slides as soon as a removal lands", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		renameMock.mockRejectedValueOnce(new Error("500"));
		draft.name = "Darkroom";

		await expect(draft.save()).rejects.toThrow("500");
		expect(
			forgetMock,
			"the lightbox must not keep deleted media",
		).toHaveBeenCalledWith(ALBUM_ID);
	});

	it("keeps an edit made while the save was in flight", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.move({ from: 0, to: 2 });
		const slow = deferred<void>();
		reorderMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.move({ from: 0, to: 1 });
		slow.resolve();
		await saving;

		expect(reorderMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentIds: [2, 3, 1],
		});
		expect(
			draft.dirty,
			"the later drag is still unsaved, so the bar must stay",
		).toBe(true);
		expect(ids(draft)).toEqual([3, 2, 1]);
	});
});
