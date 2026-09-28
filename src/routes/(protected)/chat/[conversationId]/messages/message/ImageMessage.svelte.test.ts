// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
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

afterEach(() => cleanup());

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
});
