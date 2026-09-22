import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMock, albumMock, renameMock, reorderMock, forgetMock } =
	vi.hoisted(() => ({
		deleteMock: vi.fn(),
		albumMock: vi.fn(),
		renameMock: vi.fn(),
		reorderMock: vi.fn(),
		forgetMock: vi.fn(),
	}));

vi.mock("$lib/api/messaging/albums", () => ({
	deleteAlbumContent: deleteMock,
	getAlbumContent: albumMock,
	renameAlbum: renameMock,
	reorderAlbumContent: reorderMock,
}));
vi.mock("$lib/components/album/album-lightbox", () => ({
	forgetAlbumSlides: forgetMock,
}));

import { ApiError } from "$lib/api/api-error";
import type { AlbumContent } from "$lib/model/messaging/albums";
import {
	AlbumDraftState,
	StillProcessingError,
} from "./album-draft-state.svelte";

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
	return new AlbumDraftState({
		albumId: ALBUM_ID,
		albumName,
		updatedAt: "2026-09-01T10:00:00",
		content: content.map(item),
	});
}

const ids = (draft: AlbumDraftState) =>
	draft.content.map((one) => one.contentId);

beforeEach(() => {
	deleteMock.mockReset().mockResolvedValue(undefined);
	albumMock.mockReset();
	renameMock.mockReset().mockResolvedValue(undefined);
	reorderMock.mockReset().mockResolvedValue(undefined);
	forgetMock.mockReset();
});

function refusal(status: number): ApiError {
	return new ApiError({
		message: `HTTP ${status}`,
		request: { method: "DELETE", path: "/v1/albums/903/content/2" },
		response: { status, body: "" },
	});
}

describe("AlbumDraftState", () => {
	it("keeps a processing video marked when the server refuses to delete it yet", async () => {
		const draft = new AlbumDraftState({
			albumId: ALBUM_ID,
			albumName: "Studio",
			updatedAt: "2026-09-01T10:00:00",
			content: [item(1), { ...item(2), processing: true }, item(3)],
		});
		draft.toggleRemoved(1);
		draft.toggleRemoved(2);
		draft.name = "Darkroom";
		deleteMock.mockImplementation(({ contentId }: { contentId: number }) =>
			contentId === 2 ? Promise.reject(refusal(400)) : Promise.resolve(),
		);

		await expect(draft.save()).rejects.toBeInstanceOf(StillProcessingError);

		expect(
			ids(draft),
			"the deletable item is gone, the processing one stays",
		).toEqual([2, 3]);
		expect(draft.removed).toEqual([2]);
		expect(
			renameMock,
			"the rest of the save still lands",
		).toHaveBeenCalledOnce();
		expect(draft.updatedAt).not.toBe("2026-09-01T10:00:00");
		expect(draft.dirty, "the refused removal is still pending").toBe(true);
	});

	it("reports nothing as updated when the only change was refused", async () => {
		const draft = new AlbumDraftState({
			albumId: ALBUM_ID,
			albumName: "Studio",
			updatedAt: "2026-09-01T10:00:00",
			content: [{ ...item(2), processing: true }],
		});
		draft.toggleRemoved(2);
		deleteMock.mockRejectedValue(refusal(400));

		await expect(draft.save()).rejects.toBeInstanceOf(StillProcessingError);

		expect(draft.updatedAt).toBe("2026-09-01T10:00:00");
	});

	it("fails the save on a 400 for an item that is not processing", async () => {
		const draft = draftOf([1, 2]);
		draft.toggleRemoved(2);
		const error = refusal(400);
		deleteMock.mockRejectedValue(error);

		await expect(draft.save()).rejects.toBe(error);
	});

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

	it("lands an uploaded item first without making the draft dirty", () => {
		const draft = draftOf([1, 2, 3]);
		draft.land(item(4));
		expect(ids(draft)).toEqual([4, 1, 2, 3]);
		expect(draft.dirty).toBe(false);
	});

	it("unmarks a pending removal when the same item lands again", () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		draft.land(item(2));
		expect(ids(draft), "no second copy of the item").toEqual([1, 2, 3]);
		expect(draft.removed).toEqual([]);
		expect(draft.dirty).toBe(false);
	});

	it("keeps an unsaved drag and saves it with the landed item", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.move({ from: 0, to: 2 });
		draft.land(item(4));
		expect(draft.dirty).toBe(true);

		await draft.save();
		expect(reorderMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentIds: [4, 2, 3, 1],
		});
		expect(draft.dirty).toBe(false);
	});

	it("replaces a landed item with its refreshed version in place", () => {
		const draft = draftOf([1, 2, 3]);
		draft.land({ ...item(4), statusId: 3, processing: true });
		draft.replace(item(4));
		expect(ids(draft)).toEqual([4, 1, 2, 3]);
		expect(draft.content[0]?.processing).toBe(false);
		expect(draft.dirty).toBe(false);
	});

	it("does not add an item through replace", () => {
		const draft = draftOf([1, 2, 3]);
		draft.replace(item(4));
		expect(ids(draft)).toEqual([1, 2, 3]);
	});

	it("forgets an item from content, saved content and removals", () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		draft.forget(2);
		expect(ids(draft)).toEqual([1, 3]);
		expect(draft.removed).toEqual([]);
		expect(draft.dirty).toBe(false);
	});

	it("keeps an item that landed while the reorder was in flight", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.move({ from: 0, to: 2 });
		const slow = deferred<void>();
		reorderMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.land(item(4));
		slow.resolve();
		await saving;

		expect(ids(draft)).toEqual([4, 2, 3, 1]);
		expect(draft.dirty, "the landed item is already saved").toBe(false);
	});

	it("includes an item that landed during a delete in the reorder", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		draft.move({ from: 0, to: 2 });
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.land(item(4));
		slow.resolve();
		await saving;

		expect(reorderMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentIds: [4, 3, 1],
		});
		expect(draft.dirty).toBe(false);
	});

	it("does not reorder when an item lands during a delete of an unmoved album", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.land(item(4));
		slow.resolve();
		await saving;

		expect(reorderMock).not.toHaveBeenCalled();
		expect(ids(draft)).toEqual([4, 1, 3]);
		expect(draft.dirty).toBe(false);
	});

	it("does not delete an item unmarked by a landing during the delete loop", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(1);
		draft.toggleRemoved(2);
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.land(item(2));
		slow.resolve();
		await saving;

		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(deleteMock).toHaveBeenCalledWith({
			albumId: ALBUM_ID,
			contentId: 1,
		});
		expect(ids(draft)).toEqual([2, 3]);
		expect(draft.dirty).toBe(false);
	});

	it("keeps an item that landed again during its own delete while the server still lists it", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);
		albumMock.mockResolvedValueOnce({
			albumId: ALBUM_ID,
			content: [2, 1, 3].map(item),
		});

		const saving = draft.save();
		draft.land(item(2));
		slow.resolve();
		await saving;

		expect(albumMock).toHaveBeenCalledWith(ALBUM_ID);
		expect(ids(draft)).toEqual([1, 2, 3]);
		expect(draft.removed).toEqual([]);
	});

	it("forgets an item that landed again during its own delete once the server no longer lists it", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(2);
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);
		albumMock.mockResolvedValueOnce({
			albumId: ALBUM_ID,
			content: [1, 3].map(item),
		});

		const saving = draft.save();
		draft.land(item(2));
		slow.resolve();
		await saving;

		expect(ids(draft)).toEqual([1, 3]);
		expect(draft.dirty).toBe(false);
	});

	it("does not delete an item forgotten during the delete loop", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.toggleRemoved(1);
		draft.toggleRemoved(2);
		const slow = deferred<void>();
		deleteMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.forget(2);
		slow.resolve();
		await saving;

		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(ids(draft)).toEqual([3]);
		expect(draft.dirty).toBe(false);
	});

	it("stays clean when an item is forgotten while the reorder is in flight", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.move({ from: 0, to: 2 });
		const slow = deferred<void>();
		reorderMock.mockReturnValueOnce(slow.promise);

		const saving = draft.save();
		draft.forget(3);
		slow.resolve();
		await saving;

		expect(ids(draft)).toEqual([2, 1]);
		expect(draft.dirty).toBe(false);
	});

	it("retries a refused reorder with every id including a landed item", async () => {
		const draft = draftOf([1, 2, 3]);
		draft.move({ from: 0, to: 2 });
		const refused = deferred<void>();
		reorderMock.mockReturnValueOnce(refused.promise);

		const saving = draft.save();
		draft.land(item(4));
		refused.reject(new Error("400"));
		await expect(saving).rejects.toThrow("400");
		expect(draft.dirty, "the drag is still unsaved").toBe(true);

		await draft.save();
		expect(reorderMock).toHaveBeenLastCalledWith({
			albumId: ALBUM_ID,
			contentIds: [4, 2, 3, 1],
		});
		expect(draft.dirty).toBe(false);
	});

	it("does not save while uploads into the album are pending", async () => {
		let uploading = true;
		const draft = new AlbumDraftState({
			albumId: ALBUM_ID,
			albumName: "Studio",
			updatedAt: "2026-09-01T10:00:00",
			content: [1, 2, 3].map(item),
			uploadsPending: () => uploading,
		});
		draft.move({ from: 0, to: 2 });
		expect(draft.canSave).toBe(false);

		await draft.save();
		expect(reorderMock).not.toHaveBeenCalled();

		uploading = false;
		expect(draft.canSave).toBe(true);
		await draft.save();
		expect(reorderMock).toHaveBeenCalledOnce();
	});
});
