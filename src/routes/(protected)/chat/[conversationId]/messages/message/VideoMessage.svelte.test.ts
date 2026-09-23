// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const lightbox = vi.hoisted(() => ({
	openVideoLightbox: vi.fn(() => Promise.resolve()),
}));
const dimensions = vi.hoisted(() => ({
	measureVideo: vi.fn(() => Promise.resolve({ width: 720, height: 1280 })),
	measureImage: vi.fn(),
}));

vi.mock("./video-lightbox", () => lightbox);
vi.mock("$lib/util/media-dimensions", () => dimensions);

import { viewedVideos } from "$lib/chat/viewed-videos.svelte";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

const URL = "https://cdns.grindr.com/videos/chat/clip.mp4";
const PREVIEW = '[data-slot="video-preview"]';
const UNAVAILABLE = '[data-slot="video-message-unavailable"]';

function renderVideo({
	body,
	isOut = false,
}: {
	body: Record<string, unknown>;
	isOut?: boolean;
}) {
	const message = apiResponseMessageSchema.parse({
		messageId: "m1",
		conversationId: "100001:100002",
		senderId: isOut ? 100001 : 100002,
		timestamp: 1_700_000_000_000,
		type: "Video",
		body: {
			mediaId: 900_001,
			url: URL,
			contentType: "video/mp4",
			length: 12_000,
			maxViews: 2,
			looping: false,
			...body,
		},
	});
	return render(Message, {
		props: {
			message,
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	viewedVideos.clear();
});

async function watchOnce(
	name: string,
	getByRole: (role: string, options: { name: string }) => HTMLElement,
) {
	await fireEvent.click(getByRole("button", { name }));
	await vi.waitFor(() =>
		expect(lightbox.openVideoLightbox).toHaveBeenCalledOnce(),
	);
	const [call] = lightbox.openVideoLightbox.mock.calls as unknown as [
		[{ onClosed: () => void }],
	];
	call[0].onClosed();
}

describe("video message", () => {
	it("previews a replayable video behind a play control", () => {
		const { getByRole, container } = renderVideo({ body: {} });

		expect(getByRole("button", { name: "Play video" })).toBeTruthy();
		expect(container.querySelector<HTMLVideoElement>(PREVIEW)?.src).toBe(
			`${URL}#t=0.001`,
		);
		expect(container.querySelector(UNAVAILABLE)).toBeNull();
	});

	it("plays the video in the lightbox, looping when the sender asked", async () => {
		const { getByRole } = renderVideo({ body: { looping: true } });

		await fireEvent.click(getByRole("button", { name: "Play video" }));

		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledOnce(),
		);
		expect(lightbox.openVideoLightbox).toHaveBeenCalledWith(
			expect.objectContaining({
				video: { src: URL, loop: true, width: 720, height: 1280 },
			}),
		);
	});

	it("hides an expiring video's frames behind a play control", () => {
		const { getByRole, container } = renderVideo({ body: { maxViews: 1 } });

		expect(
			getByRole("button", { name: "Play expiring video" }),
		).toBeTruthy();
		expect(container.querySelector(PREVIEW)).toBeNull();
	});

	it("locks a received view-once video after it was watched", async () => {
		const { getByRole, queryByRole, container } = renderVideo({
			body: { maxViews: 1 },
		});

		await watchOnce("Play expiring video", getByRole);

		await vi.waitFor(() =>
			expect(container.querySelector(UNAVAILABLE)).not.toBeNull(),
		);
		expect(
			queryByRole("button", { name: "Play expiring video" }),
		).toBeNull();
	});

	it("keeps our own view-once video playable after we watch it", async () => {
		const { getByRole } = renderVideo({
			body: { maxViews: 1 },
			isOut: true,
		});

		await watchOnce("Play expiring video", getByRole);

		expect(
			getByRole("button", { name: "Play expiring video" }),
		).toBeTruthy();
	});

	it("shows a received video without a url as expired", () => {
		const { queryByRole, getByText, container } = renderVideo({
			body: { url: null, maxViews: 1 },
		});

		expect(queryByRole("button", { name: /play/i })).toBeNull();
		expect(container.querySelector(PREVIEW)).toBeNull();
		expect(container.querySelector(UNAVAILABLE)).not.toBeNull();
		expect(getByText("Expired video")).toBeTruthy();
	});

	it("shows a received video with no views left as expired", () => {
		const { queryByRole, container } = renderVideo({
			body: { maxViews: 1, viewsRemaining: 0 },
		});

		expect(queryByRole("button", { name: /play/i })).toBeNull();
		expect(container.querySelector(UNAVAILABLE)).not.toBeNull();
	});

	it("keeps our own sent video without a url as an inert bubble", () => {
		const { queryByRole, queryByText, container } = renderVideo({
			body: { url: null },
			isOut: true,
		});

		expect(queryByRole("button", { name: /play/i })).toBeNull();
		expect(container.querySelector(UNAVAILABLE)).not.toBeNull();
		expect(queryByText("Expired video")).toBeNull();
	});
});
