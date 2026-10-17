// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ giphyConsent: false }));
const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesLoaded: () => true,
	preferencesSnapshot: () => ({ giphyConsent: preferences.giphyConsent }),
}));
vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: reducedMotion,
}));

import PhotoSwipeLightbox from "photoswipe/lightbox";

import { clearAccountCaches } from "$lib/api/account-caches";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

const GIF_URL = "https://media.giphy.com/media/abc/200.gif";

function renderGif({ width = 356, height = 200 } = {}) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: "100001:100002",
				senderId: 100002,
				timestamp: 1_700_000_000_000,
				type: "Giphy",
				body: {
					id: "abc",
					urlPath: GIF_URL,
					previewPath: GIF_URL,
					stillPath: "https://media.giphy.com/media/abc/200_s.gif",
					width,
					height,
					imageHash: "giphy/abc",
				},
			}),
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
}

const tapToLoad = () => screen.queryByRole("button", { name: /Tap to load/ });

async function requestedSources(): Promise<(string | null)[]> {
	await tick();
	return [...document.querySelectorAll("img")].map((img) =>
		img.getAttribute("src"),
	);
}

const lightboxLink = () =>
	document.querySelector<HTMLAnchorElement>('a[aria-label="GIF"]');

beforeEach(() => {
	preferences.giphyConsent = false;
	reducedMotion.current = false;
	clearAccountCaches();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("a GIF message", () => {
	it("asks before loading anything from GIPHY", async () => {
		renderGif();

		expect(tapToLoad()).not.toBeNull();
		expect(await requestedSources()).not.toContain(GIF_URL);
	});

	it("loads on tap and stays loaded when it scrolls back in", async () => {
		renderGif();
		await fireEvent.click(tapToLoad()!);

		expect(await requestedSources()).toContain(GIF_URL);

		cleanup();
		renderGif();

		expect(tapToLoad()).toBeNull();
		expect(await requestedSources()).toContain(GIF_URL);
	});

	it("loads right away once GIPHY is agreed to", async () => {
		preferences.giphyConsent = true;
		renderGif();

		expect(tapToLoad()).toBeNull();
		expect(await requestedSources()).toContain(GIF_URL);
	});

	it("takes its shape from the GIF that loads, not the size it was sent with", async () => {
		preferences.giphyConsent = true;
		const { container } = renderGif({ width: 200, height: 200 });
		const image = container.querySelector("img")!;
		Object.defineProperty(image, "naturalWidth", { get: () => 356 });
		Object.defineProperty(image, "naturalHeight", { get: () => 200 });

		await fireEvent.load(image);

		expect(
			container.querySelector<HTMLElement>('[style*="aspect-ratio"]')
				?.style.aspectRatio,
		).toBe("356 / 200");
	});

	it("opens GIPHY's original in the photo lightbox", async () => {
		const init = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		preferences.giphyConsent = true;
		renderGif();

		expect(lightboxLink()?.getAttribute("href")).toBe(
			"https://media.giphy.com/media/abc/giphy.gif",
		);
		await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
	});

	it("starts no lightbox for a GIF that isn't loaded yet", async () => {
		const init = vi.spyOn(PhotoSwipeLightbox.prototype, "init");
		renderGif();

		await import("photoswipe/lightbox");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(lightboxLink()).toBeNull();
		expect(init).not.toHaveBeenCalled();
	});

	it("holds still with reduced motion and plays in the lightbox", async () => {
		preferences.giphyConsent = true;
		reducedMotion.current = true;
		renderGif();

		expect(await requestedSources()).toEqual([
			"https://media.giphy.com/media/abc/200_s.gif",
		]);
		expect(screen.getByText("GIF")).toBeTruthy();
		expect(lightboxLink()?.getAttribute("href")).toBe(
			"https://media.giphy.com/media/abc/giphy.gif",
		);
	});

	it("moves keyboard focus onto the GIF it loads", async () => {
		renderGif();
		const button = tapToLoad()!;
		button.focus();

		await fireEvent.click(button);
		await tick();

		expect(document.activeElement).toBe(lightboxLink());
	});

	it("asks again after switching accounts", async () => {
		renderGif();
		await fireEvent.click(tapToLoad()!);
		cleanup();

		clearAccountCaches();
		renderGif();

		expect(tapToLoad()).not.toBeNull();
	});
});
