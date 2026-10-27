import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({ send: sendMock }),
}));

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { profileMediaUrl } from "$lib/util/media";
import * as photoswipe from "$lib/util/photoswipe";
import Message from "./Message.svelte";

const PHOTO_HASH = "a".repeat(40);

function renderPhoto({
	isOut = false,
	imageHash = PHOTO_HASH,
}: { isOut?: boolean; imageHash?: string } = {}) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				type: "ProfilePhotoReply",
				body: { imageHash, photoContentReply: "Nice photo!" },
				messageId: "photo-reply",
				conversationId: "1:2",
				senderId: isOut ? 1 : 2,
				timestamp: 1_710_000_000_000,
			}),
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
}

const photoButton = () =>
	screen.getByRole("button", { name: "Open replied profile photo" });

async function pointerClick(
	target: HTMLElement,
	pointerType: "mouse" | "touch",
) {
	await fireEvent(
		target,
		Object.assign(new Event("pointerdown", { bubbles: true }), {
			pointerType,
		}),
	);
	await fireEvent(
		target,
		Object.assign(new Event("pointerup", { bubbles: true }), {
			pointerType,
		}),
	);
	await fireEvent.click(target, { detail: 1 });
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe("profile photo reply messages", () => {
	it("keeps reply text and blocks loading an invalid peer photo hash", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		renderPhoto({ imageHash: "../invalid?hash" });
		expect(photoButton().hasAttribute("disabled")).toBe(true);
		expect(within(photoButton()).queryByRole("presentation")).toBeNull();
		expect(screen.getByText("Nice photo!")).toBeTruthy();
		await fireEvent.click(photoButton());
		expect(open).not.toHaveBeenCalled();
	});
	it("sends a reply from the viewer without consuming the chat reply target", async () => {
		renderPhoto({ isOut: true });
		await fireEvent.click(photoButton());
		const textbox = await screen.findByRole("textbox", {
			name: "Reply to profile photo",
		});
		await fireEvent.input(textbox, {
			target: { value: "  Another reply  " },
		});
		const send = screen.getByRole<HTMLButtonElement>("button", {
			name: "Send reply",
		});
		await vi.waitFor(() => expect(send.disabled).toBe(false));
		await fireEvent.click(send);
		const message = {
			type: "ProfilePhotoReply",
			body: { imageHash: PHOTO_HASH, photoContentReply: "Another reply" },
		};
		await vi.waitFor(() =>
			expect(sendMock).toHaveBeenCalledExactlyOnceWith(
				[{ outbound: message, optimistic: message }],
				{ includeReply: false },
			),
		);
	});

	it("does not offer a reply to our own profile photo", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		renderPhoto();
		await fireEvent.click(photoButton());
		expect(open).toHaveBeenCalledOnce();
		const configure = open.mock.calls[0]![0].configure!;
		const lightbox = new PhotoSwipeLightbox({});
		const on = vi.spyOn(lightbox, "on");
		configure(lightbox);
		expect(on).not.toHaveBeenCalledWith("uiRegister", expect.anything());
		expect(lightbox.options.imageClickAction).not.toBe("zoom");
	});

	it.each([false, true])(
		"renders a quoted photo separately from its text and preserves text on image failure, isOut=%s",
		async (isOut) => {
			renderPhoto({ isOut });
			const photo = photoButton();
			expect(photo.closest('[data-slot="message-quote"]')).toBeTruthy();
			expect(photo.closest('[data-slot="message-bubble"]')).toBeNull();
			expect(
				screen
					.getByText("Nice photo!")
					.closest('[data-slot="message-bubble"]'),
			).toBeTruthy();
			expect(
				within(photo).getByRole("presentation").getAttribute("src"),
			).toBe(profileMediaUrl({ mediaHash: PHOTO_HASH, size: "full" }));
			await fireEvent.error(within(photo).getByRole("presentation"));
			expect(
				photo.querySelector('[data-slot="broken-media"]'),
			).toBeTruthy();
			expect(screen.getByText("Nice photo!")).toBeTruthy();
		},
	);

	it.each(["mouse", "touch"] as const)(
		"opens immediately after a single %s activation and dims until open",
		async (pointerType) => {
			const open = vi
				.spyOn(photoswipe, "openLightbox")
				.mockResolvedValue();
			renderPhoto();
			const button = photoButton();
			const image = within(button).getByRole("presentation");
			Object.defineProperties(image, {
				naturalWidth: { value: 600 },
				naturalHeight: { value: 800 },
			});
			await fireEvent.load(image);
			await pointerClick(button, pointerType);
			expect(open).toHaveBeenCalledOnce();
			expect(open.mock.calls[0]![0].items).toEqual([
				{
					src: profileMediaUrl({
						mediaHash: PHOTO_HASH,
						size: "full",
					}),
					width: 600,
					height: 800,
				},
			]);
			expect(button.classList.contains("opacity-50")).toBe(true);
			const lightbox = new PhotoSwipeLightbox({});
			open.mock.calls[0]![0].configure!(lightbox);
			lightbox.dispatch("openingAnimationEnd");
			await vi.waitFor(() =>
				expect(button.classList.contains("opacity-50")).toBe(false),
			);
		},
	);

	it("aborts an opening viewer when unmounted", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		const view = renderPhoto();
		await pointerClick(photoButton(), "mouse");
		const signal = open.mock.calls[0]![0].signal;
		view.unmount();
		expect(signal.aborted).toBe(true);
	});
});
