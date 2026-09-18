import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
const api = vi.hoisted(() => ({ createAlbum: vi.fn() }));
const media = vi.hoisted(() => ({
	pickAlbumMedia: vi.fn(),
	enqueueAlbumMedia: vi.fn(),
}));
const store = vi.hoisted(() => ({
	inspectPicks: vi.fn(),
	uploads: { storageLimits: vi.fn() },
}));
const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("$app/navigation", () => navigation);
vi.mock("$lib/api/error-toast", () => errorToast);
vi.mock("$lib/api/messaging/albums", () => api);
vi.mock("../album-uploads/add-album-media", () => media);
vi.mock("../album-uploads/album-uploads.svelte", () => store);
vi.mock("svelte-sonner", () => sonner);

import { ApiError } from "$lib/api/api-error";
import type { PickedMedia } from "$lib/platform/media-picker";
import { createAlbumFromMedia } from "./create-album-media";

const limits = {
	maxAlbums: 5,
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
	maxContentItemsPerAlbum: 10,
	maxVideosPerAlbum: 1,
};

const picked: PickedMedia[] = [
	{ source: "desktop", key: "p", mimeType: "image/jpeg", path: "/a.jpg" },
];

const inspected = picked.map((file) => ({
	media: file,
	kind: "photo" as const,
	inspection: { kind: "photo" as const, size: 1024 },
}));

function httpError(status: number): ApiError {
	return new ApiError({
		message: `HTTP ${status}`,
		request: { method: "POST", path: "/v2/albums" },
		response: { status, body: "" },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	store.uploads.storageLimits.mockResolvedValue(limits);
	store.inspectPicks.mockResolvedValue(inspected);
	media.pickAlbumMedia.mockResolvedValue(picked);
	api.createAlbum.mockResolvedValue({ albumId: 904, albumName: "Trip" });
});

describe("creating an album from its first upload", () => {
	it("creates the album, opens it, and uploads there", async () => {
		await createAlbumFromMedia({ albumName: "Trip" });

		expect(media.pickAlbumMedia).toHaveBeenCalledWith(true);
		expect(api.createAlbum).toHaveBeenCalledWith({ albumName: "Trip" });
		expect(navigation.goto).toHaveBeenCalledWith("/albums/904", {
			replaceState: true,
		});
		expect(media.enqueueAlbumMedia).toHaveBeenCalledWith({
			albumId: 904,
			inspected,
			limits,
			content: [],
		});
		const [gotoOrder = Number.NaN] =
			navigation.goto.mock.invocationCallOrder;
		const [enqueueOrder = Number.NaN] =
			media.enqueueAlbumMedia.mock.invocationCallOrder;
		expect(
			gotoOrder,
			"the editor opens before the uploads start",
		).toBeLessThan(enqueueOrder);
	});

	it("offers photos only when the plan holds no videos", async () => {
		store.uploads.storageLimits.mockResolvedValue({
			...limits,
			maxVideosPerAlbum: 0,
		});

		await createAlbumFromMedia({ albumName: null });

		expect(media.pickAlbumMedia).toHaveBeenCalledWith(false);
	});

	it("creates nothing when the picker was dismissed", async () => {
		media.pickAlbumMedia.mockResolvedValue([]);

		await createAlbumFromMedia({ albumName: null });

		expect(api.createAlbum).not.toHaveBeenCalled();
		expect(navigation.goto).not.toHaveBeenCalled();
	});

	it("creates nothing when every pick fails inspection", async () => {
		store.inspectPicks.mockResolvedValue([]);

		await createAlbumFromMedia({ albumName: null });

		expect(api.createAlbum).not.toHaveBeenCalled();
		expect(navigation.goto).not.toHaveBeenCalled();
	});

	it("names the album limit when the server refuses another album", async () => {
		api.createAlbum.mockRejectedValue(httpError(402));

		await createAlbumFromMedia({ albumName: null });

		expect(sonner.toast.error).toHaveBeenCalledWith(
			"You can't create more albums",
		);
		expect(errorToast.showErrorToast).not.toHaveBeenCalled();
		expect(navigation.goto).not.toHaveBeenCalled();
	});

	it("reports any other failure to create the album", async () => {
		const error = httpError(500);
		api.createAlbum.mockRejectedValue(error);

		await createAlbumFromMedia({ albumName: null });

		expect(errorToast.showErrorToast).toHaveBeenCalledWith({
			label: "Couldn't create album",
			error,
		});
	});
});
