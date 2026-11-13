// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { drawerApi, photoApi, pickMediaMock, toastMock, errorToast } =
	vi.hoisted(() => ({
		drawerApi: {
			getAllDrawerMedia: vi.fn(),
			deleteDrawerMedia: vi.fn(() => Promise.resolve()),
		},
		photoApi: {
			uploadRightNowPhotoFromUrl: vi.fn(),
			uploadRightNowPickedPhoto: vi.fn(),
			RightNowPhotoTooSmallError: class extends Error {
				constructor() {
					super("This photo is too small");
				}
			},
		},
		pickMediaMock: vi.fn(),
		toastMock: { error: vi.fn() },
		errorToast: { showErrorToast: vi.fn() },
	}));

vi.mock("#lib/api/messaging/drawer.ts", () => drawerApi);
vi.mock("#lib/api/right-now/photo.ts", () => photoApi);
vi.mock("#lib/platform/media-picker.ts", () => ({ pickMedia: pickMediaMock }));
vi.mock("#lib/api/error-toast.ts", () => errorToast);
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

import type { DrawerMedia } from "#lib/api/messaging/drawer.ts";
import type { PickedMedia } from "#lib/platform/media-picker.ts";
import type { PostPhoto } from "./post-form";
import PostPhotoField from "./PostPhotoField.svelte";

const UPLOADED = {
	mediaId: 88,
	url: "https://cdns.grindr.com/rightnow/full/88",
	thumbnailUrl: "https://cdns.grindr.com/rightnow/thumb/88",
};
const PICKED: PickedMedia = {
	key: "picked",
	mimeType: "image/jpeg",
	source: "desktop",
	path: "/tmp/photo.jpg",
};

function drawerItem({
	id,
	contentType = "image/jpeg",
}: {
	id: number;
	contentType?: string;
}): DrawerMedia {
	return {
		id,
		url: `https://cdns.grindr.com/chat/drawer/${id}`,
		contentType,
		createdTs: 1_000,
		used: false,
		takenOnGrindr: false,
	};
}

function renderField({
	photo = null,
	disabled = false,
	rejectedMediaIds = [],
}: {
	photo?: PostPhoto | null;
	disabled?: boolean;
	rejectedMediaIds?: number[];
} = {}) {
	const stored = $state({ photo, uploading: false });
	render(PostPhotoField, {
		props: {
			disabled,
			rejectedMediaIds,
			get photo() {
				return stored.photo;
			},
			set photo(next: PostPhoto | null) {
				stored.photo = next;
			},
			get uploading() {
				return stored.uploading;
			},
			set uploading(next: boolean) {
				stored.uploading = next;
			},
		},
	});
	return stored;
}

async function openUploads() {
	await fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
	return screen.findByRole("dialog", { name: "Previous uploads" });
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("the post photo field", () => {
	it("names its controls after the Photo label", () => {
		renderField();

		expect(
			within(screen.getByRole("group", { name: "Photo" })).getByRole(
				"button",
				{ name: "Add photo" },
			),
		).toBeTruthy();
	});

	it("lists only the chat drawer photos to pick from", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([
			drawerItem({ id: 301 }),
			drawerItem({ id: 302, contentType: "video/mp4" }),
		]);
		renderField();

		await openUploads();

		expect(
			await screen.findByRole("button", { name: "Photo 1" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Photo 2" })).toBeNull();
		expect(screen.queryByRole("button", { name: /Video/ })).toBeNull();
	});

	it("uploads a picked drawer photo again and shows it once uploaded", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([
			drawerItem({ id: 301 }),
		]);
		const upload = Promise.withResolvers<typeof UPLOADED>();
		photoApi.uploadRightNowPhotoFromUrl.mockReturnValue(upload.promise);
		const stored = renderField();

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Photo 1" }),
		);
		await fireEvent.click(
			screen.getByRole("button", { name: /Add to post/ }),
		);

		expect(photoApi.uploadRightNowPhotoFromUrl).toHaveBeenCalledWith({
			url: "https://cdns.grindr.com/chat/drawer/301",
		});
		expect(
			await screen.findByRole("img", { name: "Uploading photo" }),
		).toBeTruthy();
		expect(stored.uploading).toBe(true);

		upload.resolve(UPLOADED);

		await vi.waitFor(() =>
			expect(stored.photo).toEqual({
				mediaId: 88,
				thumbnailUrl: UPLOADED.thumbnailUrl,
			}),
		);
		expect(stored.uploading).toBe(false);
		expect(
			screen.getByRole("button", { name: "Remove photo" }),
		).toBeTruthy();
	});

	it("uploads a photo picked on the device", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(PICKED);
		photoApi.uploadRightNowPickedPhoto.mockResolvedValue(UPLOADED);
		const stored = renderField();

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		await vi.waitFor(() =>
			expect(stored.photo).toEqual({
				mediaId: 88,
				thumbnailUrl: UPLOADED.thumbnailUrl,
			}),
		);
		expect(pickMediaMock).toHaveBeenCalledWith("image");
		expect(photoApi.uploadRightNowPickedPhoto).toHaveBeenCalledWith({
			media: PICKED,
		});
		expect(photoApi.uploadRightNowPhotoFromUrl).not.toHaveBeenCalled();
	});

	it("uploads nothing when the device picker is dismissed", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(null);
		const stored = renderField();

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		await vi.waitFor(() => expect(pickMediaMock).toHaveBeenCalledOnce());
		expect(photoApi.uploadRightNowPickedPhoto).not.toHaveBeenCalled();
		expect(stored.photo).toBeNull();
	});

	it("says when a photo is too small", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(PICKED);
		photoApi.uploadRightNowPickedPhoto.mockRejectedValue(
			new photoApi.RightNowPhotoTooSmallError(),
		);
		const stored = renderField();

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		await vi.waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith(
				"This photo is too small",
			),
		);
		expect(errorToast.showErrorToast).not.toHaveBeenCalled();
		expect(stored).toEqual({ photo: null, uploading: false });
	});

	it("reports any other failed upload", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(PICKED);
		const error = new Error("offline");
		photoApi.uploadRightNowPickedPhoto.mockRejectedValue(error);
		renderField();

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		await vi.waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledWith({
				label: "Couldn't upload photo",
				error,
			}),
		);
	});

	it("marks the photo removed without asking and keeps it on undo", async () => {
		const shownPhoto = { mediaId: 51, thumbnailUrl: UPLOADED.thumbnailUrl };
		const stored = renderField({ photo: shownPhoto });

		await fireEvent.click(
			screen.getByRole("button", { name: "Remove photo" }),
		);

		expect(stored.photo).toBeNull();
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(screen.getByRole("img", { name: "Post photo" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();

		await fireEvent.click(
			screen.getByRole("button", { name: "Keep photo" }),
		);

		expect(stored.photo).toEqual(shownPhoto);
		expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Remove photo" }),
		).toBeTruthy();
	});

	it("keeps an undo for a photo uploaded in this edit", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(PICKED);
		photoApi.uploadRightNowPickedPhoto.mockResolvedValue(UPLOADED);
		const stored = renderField();
		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);
		const remove = await screen.findByRole("button", {
			name: "Remove photo",
		});

		await fireEvent.click(remove);

		expect(stored.photo).toBeNull();
		await fireEvent.click(
			screen.getByRole("button", { name: "Keep photo" }),
		);
		expect(stored.photo).toEqual({
			mediaId: 88,
			thumbnailUrl: UPLOADED.thumbnailUrl,
		});
	});

	it("names a rejected photo as rejected", () => {
		renderField({
			photo: { mediaId: 51, thumbnailUrl: UPLOADED.thumbnailUrl },
			rejectedMediaIds: [51],
		});

		expect(
			screen.getByRole("img", { name: "Post photo, rejected" }),
		).toBeTruthy();
	});

	it("names a replacement for a rejected photo plainly", async () => {
		drawerApi.getAllDrawerMedia.mockResolvedValue([]);
		pickMediaMock.mockResolvedValue(PICKED);
		photoApi.uploadRightNowPickedPhoto.mockResolvedValue(UPLOADED);
		renderField({
			photo: { mediaId: 51, thumbnailUrl: UPLOADED.thumbnailUrl },
			rejectedMediaIds: [51],
		});
		await fireEvent.click(
			screen.getByRole("button", { name: "Remove photo" }),
		);

		await openUploads();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Upload a photo" }),
		);

		expect(
			await screen.findByRole("img", { name: "Post photo" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("img", { name: "Post photo, rejected" }),
		).toBeNull();
	});

	it("drops the undo once a new photo replaces the removed one", async () => {
		const stored = renderField({
			photo: { mediaId: 51, thumbnailUrl: UPLOADED.thumbnailUrl },
		});
		await fireEvent.click(
			screen.getByRole("button", { name: "Remove photo" }),
		);

		stored.photo = { mediaId: 53, thumbnailUrl: UPLOADED.thumbnailUrl };
		flushSync();

		expect(screen.queryByRole("button", { name: "Keep photo" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Remove photo" }),
		).toBeTruthy();
	});

	it("locks adding while disabled", () => {
		renderField({ disabled: true });

		expect(
			screen
				.getByRole("button", { name: "Add photo" })
				.matches(":disabled"),
		).toBe(true);
	});

	it("locks removing while disabled", () => {
		renderField({
			disabled: true,
			photo: { mediaId: 51, thumbnailUrl: UPLOADED.thumbnailUrl },
		});

		expect(
			screen
				.getByRole("button", { name: "Remove photo" })
				.matches(":disabled"),
		).toBe(true);
	});
});
