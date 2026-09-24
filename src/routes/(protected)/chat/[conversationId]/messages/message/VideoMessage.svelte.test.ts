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
const messagesApi = vi.hoisted(() => ({ getSingleMessage: vi.fn() }));
const errorToast = vi.hoisted(() => ({ showErrorToast: vi.fn() }));

vi.mock("./video-lightbox", () => lightbox);
vi.mock("$lib/util/media-dimensions", () => dimensions);
vi.mock("$lib/api/error-toast", () => errorToast);
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	...messagesApi,
}));

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

const LIST_URL = "https://cdns.grindr.com/videos/chat/list.mp4";
const REFETCHED_URL = "https://cdns.grindr.com/videos/chat/refetched.mp4";
const CONVERSATION_ID = "100001:100002";
const MESSAGE_ID = "m1";
const PLAY = { name: "Play expiring video" };
const SPENT = '[data-slot="video-message-spent"]';

function videoMessage({
	body,
	isOut = false,
}: {
	body: Record<string, unknown>;
	isOut?: boolean;
}) {
	return apiResponseMessageSchema.parse({
		messageId: MESSAGE_ID,
		conversationId: CONVERSATION_ID,
		senderId: isOut ? 100001 : 100002,
		timestamp: 1_700_000_000_000,
		type: "Video",
		body: {
			mediaId: 900_001,
			url: LIST_URL,
			contentType: "video/mp4",
			length: 12_000,
			maxViews: 2,
			viewsRemaining: 2,
			looping: false,
			...body,
		},
	});
}

function renderVideo({
	body,
	isOut = false,
	status,
}: {
	body: Record<string, unknown>;
	isOut?: boolean;
	status?: "sent" | "pending" | "error";
}) {
	return render(Message, {
		props: {
			message: videoMessage({ body, isOut }),
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
			status,
		},
	});
}

function refetchReturns(body: Record<string, unknown>) {
	messagesApi.getSingleMessage.mockResolvedValue({
		message: videoMessage({ body: { url: REFETCHED_URL, ...body } }),
	});
}

function closeLightbox() {
	const [call] = lightbox.openVideoLightbox.mock.calls as unknown as [
		[{ onClosed: () => void }],
	];
	call[0].onClosed();
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("video message", () => {
	it("labels every video as expiring, whatever its view budget", () => {
		for (const maxViews of [1, 2]) {
			const { getByRole, getByText, unmount } = renderVideo({
				body: { maxViews, viewsRemaining: maxViews },
			});

			expect(getByRole("button", PLAY)).toBeTruthy();
			expect(getByText("Expiring video")).toBeTruthy();
			unmount();
		}
	});

	it("never loads the video into the bubble", () => {
		const { container } = renderVideo({ body: {} });

		expect(container.querySelector("video")).toBeNull();
		expect(
			container.querySelector('[data-slot="video-preview"]'),
		).toBeNull();
	});

	it("keeps our own sent video with views left playable", () => {
		const { getByRole } = renderVideo({
			body: { viewsRemaining: 1 },
			isOut: true,
		});

		expect(getByRole("button", PLAY)).toBeTruthy();
	});

	it("greys out a video without views left, received or sent", () => {
		for (const isOut of [false, true]) {
			for (const viewsRemaining of [0, undefined]) {
				const { queryByRole, getByText, container, unmount } =
					renderVideo({ body: { viewsRemaining }, isOut });

				expect(queryByRole("button", PLAY)).toBeNull();
				expect(container.querySelector(SPENT)).not.toBeNull();
				expect(getByText("Expiring video")).toBeTruthy();
				unmount();
			}
		}
	});

	it("spends a view by refetching the message and plays the refetched url", async () => {
		refetchReturns({ looping: true, viewsRemaining: 1 });
		const { getByRole } = renderVideo({ body: {} });

		await fireEvent.click(getByRole("button", PLAY));

		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledOnce(),
		);
		expect(messagesApi.getSingleMessage).toHaveBeenCalledExactlyOnceWith({
			conversationId: CONVERSATION_ID,
			messageId: MESSAGE_ID,
		});
		expect(lightbox.openVideoLightbox).toHaveBeenCalledWith(
			expect.objectContaining({
				video: {
					src: REFETCHED_URL,
					loop: true,
					width: 720,
					height: 1280,
				},
			}),
		);
		expect(dimensions.measureVideo).toHaveBeenCalledExactlyOnceWith(
			REFETCHED_URL,
		);
	});

	it("does not loop unless the sender asked", async () => {
		refetchReturns({ looping: false });
		const { getByRole } = renderVideo({ body: { looping: true } });

		await fireEvent.click(getByRole("button", PLAY));

		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledWith(
				expect.objectContaining({
					video: expect.objectContaining({ loop: false }),
				}),
			),
		);
	});

	it("greys out a view once video after its only play", async () => {
		refetchReturns({ maxViews: 1, viewsRemaining: 0 });
		const { getByRole, queryByRole, container } = renderVideo({
			body: { maxViews: 1, viewsRemaining: 1 },
		});

		await fireEvent.click(getByRole("button", PLAY));
		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledOnce(),
		);
		closeLightbox();

		await vi.waitFor(() =>
			expect(container.querySelector(SPENT)).not.toBeNull(),
		);
		expect(queryByRole("button", PLAY)).toBeNull();
	});

	it("spends another view on each play while views are left", async () => {
		refetchReturns({ viewsRemaining: 1 });
		const { getByRole } = renderVideo({ body: {} });

		await fireEvent.click(getByRole("button", PLAY));
		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledOnce(),
		);
		closeLightbox();

		await vi.waitFor(() =>
			expect(
				(getByRole("button", PLAY) as HTMLButtonElement).disabled,
			).toBe(false),
		);
		await fireEvent.click(getByRole("button", PLAY));
		await vi.waitFor(() =>
			expect(lightbox.openVideoLightbox).toHaveBeenCalledTimes(2),
		);
		expect(messagesApi.getSingleMessage).toHaveBeenCalledTimes(2);
	});

	it("toasts and keeps the bubble when the refetch fails", async () => {
		messagesApi.getSingleMessage.mockRejectedValue(new Error("offline"));
		const { getByRole } = renderVideo({ body: {} });

		await fireEvent.click(getByRole("button", PLAY));

		await vi.waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledOnce(),
		);
		expect(lightbox.openVideoLightbox).not.toHaveBeenCalled();
		await vi.waitFor(() =>
			expect(
				(getByRole("button", PLAY) as HTMLButtonElement).disabled,
			).toBe(false),
		);
	});

	it("greys out the bubble when the refetched message has no url", async () => {
		refetchReturns({ url: null, viewsRemaining: 0 });
		const { getByRole, queryByRole, container } = renderVideo({ body: {} });

		await fireEvent.click(getByRole("button", PLAY));

		await vi.waitFor(() =>
			expect(container.querySelector(SPENT)).not.toBeNull(),
		);
		expect(queryByRole("button", PLAY)).toBeNull();
		expect(errorToast.showErrorToast).not.toHaveBeenCalled();
		expect(lightbox.openVideoLightbox).not.toHaveBeenCalled();
	});

	it("keeps our own video inert until the server confirms it", async () => {
		for (const status of ["pending", "error"] as const) {
			const { queryByRole, container, unmount } = renderVideo({
				body: { viewsRemaining: 2 },
				isOut: true,
				status,
			});

			expect(queryByRole("button", PLAY)).toBeNull();
			const bubble = container.querySelector<HTMLElement>(
				'[data-slot="video-message-sending"]',
			);
			expect(bubble).not.toBeNull();
			await fireEvent.click(bubble!);
			expect(messagesApi.getSingleMessage).not.toHaveBeenCalled();
			unmount();
		}
	});

});
