import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({ send: sendMock }),
}));
vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import { apiResponseMessageSchema } from "#lib/model/messaging/messages.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import { profileMediaUrl } from "#lib/util/media.ts";
import * as photoswipe from "#lib/util/photoswipe/index.ts";
import Message from "./Message.svelte";

const PHOTO_HASH = "a".repeat(40);

function renderPhoto({
	isOut = false,
	imageHash = PHOTO_HASH,
	onReply,
	onReact,
}: {
	isOut?: boolean;
	imageHash?: string;
	onReply?: () => void;
	onReact?: (reactionId: number) => void;
} = {}) {
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
			onReply,
			onReact,
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

beforeEach(() => {
	runningOn("windows");
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	resetPlatform();
});

describe("profile photo reply messages", () => {
	it("keeps reply text and blocks loading an invalid peer photo hash", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		renderPhoto({ imageHash: "../invalid?hash" });
		expect(photoButton().getAttribute("aria-disabled")).toBe("true");
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

	it("keeps focus on a photo opened from the keyboard while its viewer opens and ignores a second press", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		renderPhoto();
		const button = photoButton();
		button.focus();

		await fireEvent.click(button);
		await fireEvent.click(button);

		expect(open).toHaveBeenCalledOnce();
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(button.hasAttribute("disabled")).toBe(false);
		expect(document.activeElement).toBe(button);
	});

	it("lets go of focus when the photo is opened with a pointer, so the closing viewer leaves no ring on it", async () => {
		vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		renderPhoto();
		const button = photoButton();
		button.focus();

		await pointerClick(button, "mouse");

		expect(document.activeElement).not.toBe(button);
	});

	it("leaves a double click on the photo out of replying to the message", async () => {
		const onReply = vi.fn();
		renderPhoto({ onReply });

		await fireEvent.dblClick(photoButton());

		expect(onReply).not.toHaveBeenCalled();
	});

	it("still reacts to a double tap on the photo", () => {
		runningOn("android");
		const onReply = vi.fn();
		const onReact = vi.fn();
		renderPhoto({ onReply, onReact });
		const button = photoButton();

		for (let tap = 0; tap < 2; tap += 1) {
			button.dispatchEvent(pointerEvent("pointerdown"));
			button.dispatchEvent(pointerEvent("pointerup"));
		}
		button.dispatchEvent(
			new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
		);

		expect(onReact).toHaveBeenCalledExactlyOnceWith(1);
		expect(onReply).not.toHaveBeenCalled();
	});

	it("aborts an opening viewer when unmounted", async () => {
		const open = vi.spyOn(photoswipe, "openLightbox").mockResolvedValue();
		const view = renderPhoto();
		await pointerClick(photoButton(), "mouse");
		const signal = open.mock.calls[0]![0].signal;
		view.unmount();
		expect(signal.aborted).toBe(true);
	});
});

describe("profile photo reply messages on Google Play", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("covers the peer's photo our reply quotes and keeps it out of the viewer", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		renderPhoto({ isOut: true });

		expect(
			screen.queryByRole("button", {
				name: "Open replied profile photo",
			}),
		).toBeNull();
		expect(
			within(
				screen.getByRole("group", { name: "Replied profile photo" }),
			).getByRole("link", { name: "Show mature content" }),
		).toBeTruthy();
		expect(screen.getByText("Nice photo!")).toBeTruthy();
	});

	it("shows our own photo that the peer's reply quotes", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		renderPhoto({ isOut: false });

		expect(photoButton()).toBeTruthy();
		expect(
			screen.queryByRole("link", { name: "Show mature content" }),
		).toBeNull();
	});
});
