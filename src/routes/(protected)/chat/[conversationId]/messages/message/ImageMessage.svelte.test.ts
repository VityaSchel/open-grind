// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import { apiResponseMessageSchema } from "#lib/model/messaging/messages.ts";
import Message from "./Message.svelte";

const signed = ({ file, signature }: { file: string; signature: string }) =>
	`https://d3.cloudfront.net/chat/${file}?Expires=1700000900&Signature=${signature}&Key-Pair-Id=K`;

const OLD = signed({ file: "p.jpg", signature: "OLD" });
const RENEWED = signed({ file: "p.jpg", signature: "NEW" });
const OTHER_FILE = signed({ file: "q.jpg", signature: "NEW" });

function photoMessage(url: string) {
	return apiResponseMessageSchema.parse({
		messageId: "m1",
		conversationId: "100001:100002",
		senderId: 100002,
		timestamp: 1_700_000_000_000,
		type: "Image",
		body: {
			mediaId: 1,
			width: 300,
			height: 400,
			url,
			imageHash: "a".repeat(64),
			takenOnGrindr: false,
			createdAt: null,
		},
	});
}

function renderPhoto(url: string) {
	const { container, rerender } = render(Message, {
		props: {
			message: photoMessage(url),
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
	const link = () =>
		container.querySelector<HTMLAnchorElement>('a[aria-label="Photo"]');
	const image = () => {
		const img = link()?.querySelector("img");
		if (!img) throw new Error("no photo image");
		return img;
	};
	return {
		link,
		image,
		renew: (next: string) => rerender({ message: photoMessage(next) }),
	};
}

function loaded(img: HTMLImageElement) {
	Object.defineProperty(img, "naturalWidth", { get: () => 300 });
	Object.defineProperty(img, "naturalHeight", { get: () => 400 });
	return fireEvent.load(img);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("photo message", () => {
	it("keeps a loaded photo on its url when only the signature is renewed", async () => {
		const photo = renderPhoto(OLD);
		await loaded(photo.image());

		await photo.renew(RENEWED);

		expect(photo.image().getAttribute("src")).toBe(OLD);
		expect(photo.link()?.getAttribute("href")).toBe(RENEWED);
	});

	it("loads the renewed url for a photo that failed", async () => {
		const photo = renderPhoto(OLD);
		await fireEvent.error(photo.image());

		await photo.renew(RENEWED);

		expect(photo.image().getAttribute("src")).toBe(RENEWED);
	});

	it("switches a loaded photo to a different file", async () => {
		const photo = renderPhoto(OLD);
		await loaded(photo.image());

		await photo.renew(OTHER_FILE);

		expect(photo.image().getAttribute("src")).toBe(OTHER_FILE);
	});

	it("starts a lightbox for a photo that stays on screen", async () => {
		const init = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		renderPhoto(OLD);

		await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
	});

	it("starts no lightbox for a photo that left before the lightbox loaded", async () => {
		const init = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		renderPhoto(OLD);

		cleanup();
		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(init).not.toHaveBeenCalled();
	});
});

describe("photo message on Google Play", () => {
	afterEach(() => vi.unstubAllEnvs());

	function renderOnPlay({ isOut }: { isOut: boolean }) {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		return render(Message, {
			props: {
				message: photoMessage(OLD),
				isOut,
				isRead: null,
				indexInStack: 0,
				stackLength: 1,
			},
		});
	}

	it("covers a received photo and links to the mature content setting instead of the lightbox", () => {
		const { container, getByRole } = renderOnPlay({ isOut: false });

		expect(container.querySelector('a[aria-label="Photo"]')).toBeNull();
		const photo = getByRole("group", { name: "Photo" });
		expect(
			photo.contains(getByRole("link", { name: "Show mature content" })),
		).toBe(true);
		expect(photo.querySelector("img")?.getAttribute("src")).toBe(OLD);
	});

	it("shows a photo we sent", () => {
		const { container } = renderOnPlay({ isOut: true });

		expect(
			container
				.querySelector('a[aria-label="Photo"]')
				?.getAttribute("href"),
		).toBe(OLD);
		expect(
			container.querySelector('[data-slot="mature-content-cover"]'),
		).toBeNull();
	});
});
