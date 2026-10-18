// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({
	values: new Map<string, boolean>(),
	setPreferences:
		vi.fn<(values: { giphyConsent: boolean }) => Promise<void>>(),
}));
const reducedMotion = vi.hoisted(() => ({ current: false }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock("$lib/app-data/preferences.svelte", async () => {
	const { SvelteMap } = await import("svelte/reactivity");
	preferences.values = new SvelteMap();
	return {
		preferencesLoaded: () => true,
		preferencesSnapshot: () => ({
			giphyConsent: preferences.values.get("giphyConsent") ?? false,
		}),
		setPreferences: preferences.setPreferences,
	};
});
vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: reducedMotion,
}));

import PhotoSwipeLightbox from "photoswipe/lightbox";

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
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

function giveConsent() {
	preferences.values.set("giphyConsent", true);
}

const consentDialog = () => screen.queryByRole("alertdialog");
const choice = (name: "Continue" | "Cancel") =>
	screen.getByRole("button", { name });

async function tapAndChoose(choice: "Continue" | "Cancel") {
	await fireEvent.click(tapToLoad()!);
	await vi.waitFor(() =>
		expect(consentDialog()?.contains(document.activeElement)).toBe(true),
	);
	await fireEvent.click(screen.getByRole("button", { name: choice }));
	await tick();
}

beforeEach(() => {
	preferences.values.clear();
	preferences.setPreferences.mockReset();
	toast.mockReset();
	toast.error.mockReset();
	preferences.setPreferences.mockImplementation(({ giphyConsent }) => {
		preferences.values.set("giphyConsent", giphyConsent);
		return Promise.resolve();
	});
	reducedMotion.current = false;
});

afterEach(async () => {
	const cancel = screen.queryByRole("button", { name: "Cancel" });
	if (cancel) {
		await fireEvent.click(cancel);
		await vi.waitFor(() => expect(consentDialog()).toBeNull());
	}
	cleanup();
	vi.restoreAllMocks();
});

describe("a GIF message", () => {
	it("asks before loading anything from GIPHY", async () => {
		renderGif();

		expect(tapToLoad()).not.toBeNull();
		expect(await requestedSources()).not.toContain(GIF_URL);
	});

	it("asks to enable GIPHY on tap, with GIPHY's privacy policy", async () => {
		renderGif();
		await fireEvent.click(tapToLoad()!);

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Enable GIPHY?");
		expect(
			screen
				.getByRole("link", { name: "Privacy Policy" })
				.getAttribute("href"),
		).toContain("giphy.com");
		expect(await requestedSources()).not.toContain(GIF_URL);
	});

	it("turns GIPHY on and loads the GIF after Continue", async () => {
		renderGif();

		await tapAndChoose("Continue");

		expect(preferences.setPreferences).toHaveBeenCalledExactlyOnceWith({
			giphyConsent: true,
		});
		await vi.waitFor(() => expect(consentDialog()).toBeNull());
		expect(tapToLoad()).toBeNull();
		expect(await requestedSources()).toContain(GIF_URL);
	});

	it("loads nothing when the question is cancelled", async () => {
		renderGif();

		await tapAndChoose("Cancel");

		await vi.waitFor(() => expect(consentDialog()).toBeNull());
		expect(preferences.setPreferences).not.toHaveBeenCalled();
		expect(tapToLoad()).not.toBeNull();
		expect(await requestedSources()).not.toContain(GIF_URL);
	});

	it("keeps asking when turning GIPHY on fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		preferences.setPreferences.mockRejectedValue(new Error("disk full"));
		renderGif();

		await tapAndChoose("Continue");

		await vi.waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Failed to save preferences",
				expect.anything(),
			),
		);
		expect(consentDialog()).not.toBeNull();
		expect(choice("Continue").matches(":disabled")).toBe(false);
		expect(choice("Cancel").matches(":disabled")).toBe(false);
		expect(await requestedSources()).not.toContain(GIF_URL);
	});

	it("locks the question while GIPHY is being turned on", async () => {
		let finish!: () => void;
		preferences.setPreferences.mockImplementation(
			({ giphyConsent }) =>
				new Promise<void>((resolve) => {
					finish = () => {
						preferences.values.set("giphyConsent", giphyConsent);
						resolve();
					};
				}),
		);
		renderGif();

		await tapAndChoose("Continue");

		expect(choice("Continue").getAttribute("aria-busy")).toBe("true");
		expect(choice("Continue").matches(":disabled")).toBe(true);
		expect(choice("Cancel").matches(":disabled")).toBe(true);
		await fireEvent.keyDown(document.activeElement ?? document.body, {
			key: "Escape",
		});
		expect(consentDialog()?.dataset.state).toBe("open");
		for (const handler of backGestureEventHandlers.keys()) handler();
		await tick();
		expect(consentDialog()?.dataset.state).toBe("open");

		finish();
		await vi.waitFor(() => expect(consentDialog()).toBeNull());
		expect(await requestedSources()).toContain(GIF_URL);
	});

	it("loads right away once GIPHY is agreed to", async () => {
		giveConsent();
		renderGif();

		expect(tapToLoad()).toBeNull();
		expect(await requestedSources()).toContain(GIF_URL);
	});

	it("takes its shape from the GIF that loads, not the size it was sent with", async () => {
		giveConsent();
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
		giveConsent();
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
		giveConsent();
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
		tapToLoad()!.focus();

		await tapAndChoose("Continue");

		await vi.waitFor(() =>
			expect(document.activeElement).toBe(lightboxLink()),
		);
	});

	it("gives focus back to the tile when the question is cancelled", async () => {
		renderGif();
		const tile = tapToLoad()!;
		tile.focus();

		await tapAndChoose("Cancel");

		await vi.waitFor(() => expect(document.activeElement).toBe(tile));
	});
});
