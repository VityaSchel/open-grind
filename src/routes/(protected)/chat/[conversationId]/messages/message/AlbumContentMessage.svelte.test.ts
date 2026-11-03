import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlbumSlide } from "$lib/components/album/album-lightbox";

const NOW = 1_700_000_000_000;
const lightbox = vi.hoisted(() => ({
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn<
		(options: {
			signal: AbortSignal;
			onreact?: (slide: AlbumSlide) => void;
			onreply?: (reply: { slide: AlbumSlide; text: string }) => void;
		}) => Promise<void>
	>(() => Promise.resolve()),
	state: { profile: { profileId: 2 }, clearReplyTo: vi.fn(), send: vi.fn() },
}));

vi.mock("$lib/components/album/album-lightbox", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("$lib/components/album/album-lightbox")
	>()),
	...lightbox,
}));
vi.mock("../../conversation-state.svelte", () => ({
	getConversationState: () => () => lightbox.state,
}));

import { albumShares } from "$lib/chat/album-shares.svelte";
import {
	type AlbumContentReactionMessage,
	type AlbumContentReplyMessage,
	apiResponseMessageSchema,
} from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

function renderReply({
	body = {},
	isOut = false,
}: { body?: Partial<AlbumContentReplyMessage["body"]>; isOut?: boolean } = {}) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "album-reply-1",
				conversationId: "1:2",
				senderId: isOut ? 1 : 2,
				timestamp: NOW,
				type: "AlbumContentReply",
				body: {
					albumId: 7,
					albumContentId: 71,
					ownerProfileId: 2,
					previewUrl: "https://example.invalid/preview.jpg",
					expiresAt: null,
					viewable: true,
					contentType: "image/jpeg",
					albumContentReply: "A lovely photo",
					...body,
				},
			}),
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
}

afterEach(() => {
	cleanup();
	albumShares.clear();
	vi.clearAllMocks();
});

describe("AlbumContentReply", () => {
	const content = () => screen.getByText("A lovely photo");
	const renderContent = renderReply;

	it.each([false, true])(
		"renders the reply text and album item preview with isOut=%s",
		(isOut) => {
			renderContent({ isOut });

			expect(content()).toBeTruthy();
			const preview = screen.getByRole("button", {
				name: "Open replied album content",
			});
			expect(preview.closest('[data-slot="message-quote"]')).toBeTruthy();
			expect(
				content().closest('[data-slot="message-bubble"]'),
			).toBeTruthy();
			expect(preview.closest('[data-slot="message-bubble"]')).toBeNull();
			expect(
				preview.querySelector(
					'[data-slot="album-preview-photo-badge"], [data-slot="album-preview-video-badge"]',
				),
			).toBeNull();
			expect(
				within(preview).getByRole("presentation").getAttribute("src"),
			).toBe("https://example.invalid/preview.jpg");
		},
	);

	it.each([{ viewable: false }, { previewUrl: null }])(
		"keeps the text when album access is unavailable: %j",
		(body) => {
			renderContent({ body });

			expect(content()).toBeTruthy();
			expect(
				screen.getByRole("img", { name: "Album content unavailable" }),
			).toBeTruthy();
			expect(
				screen.queryByRole("button", {
					name: "Open replied album content",
				}),
			).toBeNull();
		},
	);

	it("removes an unshared preview and restores it when shared again", async () => {
		renderContent();
		albumShares.set({ albumId: 7, profileId: 2, shared: false });
		await tick();

		expect(
			screen.queryByRole("button", {
				name: "Open replied album content",
			}),
		).toBeNull();
		expect(content()).toBeTruthy();

		albumShares.set({ albumId: 7, profileId: 2, shared: true });
		await tick();

		expect(
			screen.getByRole("button", { name: "Open replied album content" }),
		).toBeTruthy();
	});

	it("loads the replied album only after opening its preview", async () => {
		lightbox.loadAlbumSlides.mockResolvedValue([]);
		renderContent();
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();

		await fireEvent.click(
			screen.getByRole("button", { name: "Open replied album content" }),
		);

		expect(lightbox.loadAlbumSlides).toHaveBeenCalledExactlyOnceWith(7);
	});

	it("opens the replied item and can reply to the selected album slide", async () => {
		const slide: AlbumSlide = {
			contentId: 72,
			contentType: "video/mp4",
			coverUrl: "https://example.invalid/cover.jpg",
			thumbUrl: "https://example.invalid/thumb.jpg",
			url: "https://example.invalid/video.mp4",
			statusId: 0,
			processing: false,
			rejectionId: null,
		};
		lightbox.loadAlbumSlides.mockResolvedValue([slide]);
		renderContent();
		await fireEvent.click(
			screen.getByRole("button", { name: "Open replied album content" }),
		);
		await vi.waitFor(() =>
			expect(lightbox.openAlbumLightbox).toHaveBeenCalledWith(
				expect.objectContaining({ albumId: 7, albumContentId: 71 }),
			),
		);

		const options = lightbox.openAlbumLightbox.mock.calls.at(-1)?.[0];
		expect(options?.onreply).toBeTypeOf("function");
		options?.onreply?.({ slide, text: "Nice video" });
		expect(lightbox.state.clearReplyTo).not.toHaveBeenCalled();
		expect(lightbox.state.send).toHaveBeenLastCalledWith(
			[
				expect.objectContaining({
					outbound: {
						type: "AlbumContentReply",
						body: {
							albumId: 7,
							albumContentId: 72,
							albumContentReply: "Nice video",
						},
					},
				}),
			],
			{ includeReply: false },
		);
	});

	it("does not offer album replies on our own content", async () => {
		lightbox.loadAlbumSlides.mockResolvedValue([{ contentId: 71 }]);
		renderContent({ body: { ownerProfileId: 1 } });
		await fireEvent.click(
			screen.getByRole("button", { name: "Open replied album content" }),
		);
		await vi.waitFor(() =>
			expect(lightbox.openAlbumLightbox).toHaveBeenCalled(),
		);
		const options = lightbox.openAlbumLightbox.mock.calls.at(-1)?.[0];
		expect(options?.onreply).toBeUndefined();
	});
});

function renderReaction({
	body = {},
	isOut = false,
}: {
	body?: Partial<AlbumContentReactionMessage["body"]>;
	isOut?: boolean;
} = {}) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "reaction",
				conversationId: "1:2",
				senderId: isOut ? 1 : 2,
				timestamp: 1_700_000_000_000,
				type: "AlbumContentReaction",
				body: {
					albumId: 7,
					albumContentId: 71,
					ownerProfileId: 2,
					previewUrl: "https://example.invalid/preview.jpg",
					expiresAt: null,
					viewable: true,
					...body,
				},
			}),
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
}

describe("album content reaction", () => {
	it.each([true, false])(
		"shows quoted media and a fire reaction with isOut=%s",
		(isOut) => {
			const { container } = renderReaction({ isOut });
			expect(
				screen.getByRole("button", {
					name: "Open reacted album content",
				}),
			).toBeTruthy();
			expect(
				screen.getByRole("img", { name: "Fire reaction" }),
			).toBeTruthy();
			expect(
				container.querySelector('[data-slot="message-bubble"]'),
			).toBeNull();
			expect(
				screen
					.getByRole("button", { name: "Open reacted album content" })
					.closest('[data-slot="message-quote"]'),
			).toBeTruthy();
			expect(
				screen
					.getByRole("img", { name: "Fire reaction" })
					.closest('[data-slot="message-bubble"]'),
			).toBeNull();
			expect(container.querySelector('[data-slot="badge"]')).toBeNull();
			expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
		},
	);
	it.each([{ viewable: false }, { previewUrl: null }])(
		"hides unavailable media: %j",
		(body) => {
			renderReaction({ body });
			expect(
				screen.queryByRole("button", {
					name: "Open reacted album content",
				}),
			).toBeNull();
			expect(
				screen.getByRole("img", { name: "Album content unavailable" }),
			).toBeTruthy();
			expect(
				screen.getByRole("img", { name: "Fire reaction" }),
			).toBeTruthy();
		},
	);
	it("opens the referenced item and reacts to the current slide without aborting the viewer", async () => {
		const slide: AlbumSlide = {
			contentId: 72,
			contentType: "image/jpeg",
			url: "https://example.invalid/full.jpg",
			thumbUrl: "https://example.invalid/thumb.jpg",
			coverUrl: null,
			statusId: 1,
			processing: false,
			rejectionId: null,
		};
		lightbox.loadAlbumSlides.mockResolvedValue([slide]);
		renderReaction();
		await fireEvent.click(
			screen.getByRole("button", { name: "Open reacted album content" }),
		);
		await vi.waitFor(() =>
			expect(lightbox.openAlbumLightbox).toHaveBeenCalledWith(
				expect.objectContaining({ albumId: 7, albumContentId: 71 }),
			),
		);
		const options = lightbox.openAlbumLightbox.mock.calls.at(-1)![0];
		options.onreact?.(slide);
		await tick();
		expect(lightbox.state.send).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					outbound: {
						type: "AlbumContentReaction",
						body: { albumId: 7, albumContentId: 72 },
					},
				}),
			],
			{ includeReply: false },
		);
		expect(options.onreply).toBeTypeOf("function");
		options.onreply?.({ slide, text: "Another reply" });
		expect(lightbox.state.send).toHaveBeenLastCalledWith(
			[
				expect.objectContaining({
					outbound: {
						type: "AlbumContentReply",
						body: {
							albumId: 7,
							albumContentId: 72,
							albumContentReply: "Another reply",
						},
					},
				}),
			],
			{ includeReply: false },
		);
		expect(options.signal.aborted).toBe(false);
		albumShares.set({ albumId: 7, profileId: 2, shared: false });
		await tick();
		expect(options.signal.aborted).toBe(true);
		expect(
			screen.queryByRole("button", {
				name: "Open reacted album content",
			}),
		).toBeNull();
	});
	it("does not offer reactions on our own content", async () => {
		lightbox.loadAlbumSlides.mockResolvedValue([{ contentId: 71 }]);
		renderReaction({ body: { ownerProfileId: 1 } });
		await fireEvent.click(
			screen.getByRole("button", { name: "Open reacted album content" }),
		);
		await vi.waitFor(() =>
			expect(lightbox.openAlbumLightbox).toHaveBeenCalled(),
		);
		expect(
			lightbox.openAlbumLightbox.mock.calls.at(-1)![0].onreact,
		).toBeUndefined();
		expect(
			lightbox.openAlbumLightbox.mock.calls.at(-1)![0].onreply,
		).toBeUndefined();
	});
});
