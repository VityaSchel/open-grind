// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rightClick } from "$lib/test/context-menu";

const drawer = vi.hoisted(() => ({
	getDrawerMedia: vi.fn(),
	deleteDrawerMedia: vi.fn(),
}));
const chatMedia = vi.hoisted(() => ({
	addMediaToDrawer: vi.fn(),
	CHAT_MEDIA_MAX_LABEL: "120.00 MB",
	UnsupportedChatMediaError: class extends Error {},
}));
const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
const picker = vi.hoisted(() => ({ pickMultipleMedia: vi.fn() }));

vi.mock("$lib/api/messaging/drawer", () => drawer);
vi.mock("$lib/api/messaging/chat-media", () => chatMedia);
vi.mock("$lib/platform/media-picker", () => picker);
vi.mock("svelte-sonner", () => sonner);
vi.mock("../../message-composer-context.svelte", () => ({
	getMessageComposerContext: () => () => ({}),
}));
vi.mock("../../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({ conversationId: "100001:100002" }),
}));

import type { DrawerMedia } from "$lib/api/messaging/drawer";
import ComposerMediaTab from "./ComposerMediaTab.svelte";

const PENDING = '[data-slot="media-image-pending"]';
const SKELETON = '[data-slot="skeleton"]';
const PREVIEW = '[data-slot="video-preview"]';
const VIDEO_BADGE = '[data-slot="media-tile-video-badge"]';
const LIFTED = '[data-slot="media-tile-lifted"]';

const photo: DrawerMedia = {
	id: 800_001,
	url: `https://cdns.grindr.com/images/chat/${"a".repeat(64)}`,
	contentType: "image/jpeg",
	createdTs: 1_700_000_000_000,
	used: false,
	takenOnGrindr: true,
};

const video: DrawerMedia = {
	...photo,
	id: 800_002,
	url: "https://cdns.grindr.com/videos/chat/clip.mp4",
	contentType: "video/mp4",
};

function renderTab() {
	return render(ComposerMediaTab, {
		props: {
			onClose: () => {},
			onSelectionChange: () => {},
			expiring: false,
		},
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("composer media tab", () => {
	it("shows the loading grid as pending media images", async () => {
		drawer.getDrawerMedia.mockReturnValue(new Promise(() => {}));
		const { container } = renderTab();
		await tick();

		expect(container.querySelectorAll(PENDING)).toHaveLength(12);
		expect(container.querySelectorAll(SKELETON)).toHaveLength(0);
	});

	it("shows an upload in flight as a pending media image", async () => {
		drawer.getDrawerMedia.mockResolvedValue([]);
		picker.pickMultipleMedia.mockResolvedValue([
			{ key: "picked", mimeType: "image/jpeg", path: "/picked.jpg" },
		]);
		chatMedia.addMediaToDrawer.mockReturnValue(new Promise(() => {}));
		const { getByRole, container } = renderTab();
		await tick();
		await tick();

		await fireEvent.click(
			getByRole("button", { name: "Upload photos or videos" }),
		);
		await vi.waitFor(() =>
			expect(chatMedia.addMediaToDrawer).toHaveBeenCalledOnce(),
		);
		await tick();

		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("media");
		expect(container.querySelectorAll(PENDING)).toHaveLength(1);
		expect(container.querySelectorAll(SKELETON)).toHaveLength(0);
	});

	it("names the size limit when a picked file is too large to send", async () => {
		drawer.getDrawerMedia.mockResolvedValue([]);
		picker.pickMultipleMedia.mockResolvedValue([
			{ key: "picked", mimeType: "video/mp4", path: "/picked.mp4" },
		]);
		chatMedia.addMediaToDrawer.mockRejectedValue({
			kind: "ContentTooLarge",
		});
		const { getByRole } = renderTab();
		await tick();
		await tick();

		await fireEvent.click(
			getByRole("button", { name: "Upload photos or videos" }),
		);

		await vi.waitFor(() =>
			expect(sonner.toast.error).toHaveBeenCalledWith(
				"Larger than the 120.00 MB limit",
			),
		);
	});

	it("says the upload failed when a picked file can't be uploaded", async () => {
		drawer.getDrawerMedia.mockResolvedValue([]);
		picker.pickMultipleMedia.mockResolvedValue([
			{ key: "picked", mimeType: "image/jpeg", path: "/picked.jpg" },
		]);
		chatMedia.addMediaToDrawer.mockRejectedValue(new Error("offline"));
		const { getByRole } = renderTab();
		await tick();
		await tick();

		await fireEvent.click(
			getByRole("button", { name: "Upload photos or videos" }),
		);

		await vi.waitFor(() =>
			expect(sonner.toast.error).toHaveBeenCalledWith(
				"Couldn't upload photo or video",
			),
		);
	});

	it("shows a video as a muted, paused preview marked as video", async () => {
		drawer.getDrawerMedia.mockResolvedValue([photo, video]);
		const { findByRole } = renderTab();

		const tile = await findByRole("button", { name: "Video 2" });

		const preview = tile.querySelector<HTMLVideoElement>(PREVIEW);
		expect(preview?.src).toBe(`${video.url}#t=0.001`);
		expect(preview?.muted).toBe(true);
		expect(preview?.autoplay).toBe(false);
		expect(preview?.preload).toBe("metadata");
		expect(tile.querySelector(VIDEO_BADGE)).not.toBeNull();
	});

	it("keeps a photo as an image without the video badge", async () => {
		drawer.getDrawerMedia.mockResolvedValue([photo, video]);
		const { findByRole } = renderTab();

		const tile = await findByRole("button", { name: "Photo 1" });

		expect(tile.querySelector(PREVIEW)).toBeNull();
		expect(tile.querySelector(VIDEO_BADGE)).toBeNull();
	});

	it("marks media already sent on its tile and on the lifted copy", async () => {
		drawer.getDrawerMedia.mockResolvedValue([
			{ ...photo, used: true },
			video,
		]);
		const { findByRole, getByRole } = renderTab();

		const sent = await findByRole("button", { name: "Photo 1 Sent" });
		expect(
			getByRole("button", { name: "Video 2" }).textContent,
		).not.toContain("Sent");

		await rightClick(sent);
		await findByRole("menuitem", { name: "Delete permanently" });
		expect(document.querySelector(LIFTED)?.textContent).toContain("Sent");
	});

	it("deletes a drawer item for good and drops it from the selection", async () => {
		const onSelectionChange = vi.fn();
		drawer.getDrawerMedia.mockResolvedValue([photo]);
		drawer.deleteDrawerMedia.mockResolvedValue(undefined);
		const { findByRole, queryByRole } = render(ComposerMediaTab, {
			props: { onClose: () => {}, onSelectionChange, expiring: false },
		});
		const tile = await findByRole("button", { name: "Photo 1" });

		await fireEvent.click(tile);
		await rightClick(tile);
		await fireEvent.click(
			await findByRole("menuitem", { name: "Delete permanently" }),
		);
		await fireEvent.click(await findByRole("button", { name: "Delete" }));

		expect(drawer.deleteDrawerMedia).toHaveBeenCalledWith(800_001);
		await vi.waitFor(() =>
			expect(queryByRole("button", { name: "Photo 1" })).toBeNull(),
		);
		expect(onSelectionChange).toHaveBeenLastCalledWith({
			count: 0,
			action: "send",
		});
	});
});
