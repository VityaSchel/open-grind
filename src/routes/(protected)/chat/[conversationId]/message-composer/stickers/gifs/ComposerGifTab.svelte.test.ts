// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GiphyPage } from "$lib/api/messaging/gifs";

const api = vi.hoisted(() => ({
	getTrendingGifs:
		vi.fn<(params: { offset: number }) => Promise<GiphyPage>>(),
	searchGifs:
		vi.fn<
			(params: { query: string; offset: number }) => Promise<GiphyPage>
		>(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
const reducedMotion = vi.hoisted(() => ({ current: false }));
const preferences = vi.hoisted(() => ({
	values: new Map<string, boolean>(),
	setPreferences:
		vi.fn<(values: { giphyConsent: boolean }) => Promise<void>>(),
}));

vi.mock("$lib/api/messaging/gifs", () => api);
vi.mock("$lib/app-data/preferences.svelte", async () => {
	const { SvelteMap } = await import("svelte/reactivity");
	preferences.values = new SvelteMap();
	return {
		preferencesLoaded: () => preferences.values.get("loaded") ?? false,
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

import type { StickerPick } from "../sticker-pick";
import ComposerGifTab from "./ComposerGifTab.svelte";
import { gifTile } from "./gif-test-helpers";

class InertIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

function trendingPage(ids: string[]): GiphyPage {
	return {
		gifs: ids.map((id) => gifTile(id, { alt: `Trending ${id}` })),
		nextOffset: null,
	};
}

const onPick = vi.fn<(pick: StickerPick) => void>();
const onFeedRestart = vi.fn<() => void>();

async function settle() {
	await tick();
	await Promise.resolve();
	await tick();
}

async function mount({
	active = true,
	pickedId = null,
}: { active?: boolean; pickedId?: string | null } = {}) {
	const rendered = render(ComposerGifTab, {
		props: { active, pickedId, onPick, onFeedRestart },
	});
	await settle();
	return rendered;
}

const tile = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => tile(name).getAttribute("aria-pressed");

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
	reducedMotion.current = false;
	onPick.mockReset();
	onFeedRestart.mockReset();
	toast.mockReset();
	toast.error.mockReset();
	api.getTrendingGifs.mockReset();
	api.searchGifs.mockReset();
	api.getTrendingGifs.mockResolvedValue(trendingPage(["a", "b"]));
	api.searchGifs.mockResolvedValue(trendingPage([]));
	preferences.values.clear();
	preferences.values.set("loaded", true);
	preferences.values.set("giphyConsent", true);
	preferences.setPreferences.mockReset();
	preferences.setPreferences.mockImplementation((values) => {
		preferences.values.set("giphyConsent", values.giphyConsent);
		return Promise.resolve();
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("composer GIF tab", () => {
	it("renders nothing until preferences are loaded", async () => {
		preferences.values.set("loaded", false);
		const { container } = await mount();

		expect(container.textContent?.trim()).toBe("");
		expect(api.getTrendingGifs).not.toHaveBeenCalled();
	});

	it("asks for consent before anything reaches GIPHY", async () => {
		preferences.values.set("giphyConsent", false);
		await mount();

		expect(
			screen.getByText(/GIFs in your chats will load on their own/),
		).toBeTruthy();
		expect(screen.queryByRole("searchbox")).toBeNull();
		expect(api.getTrendingGifs).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		await settle();

		expect(preferences.setPreferences).toHaveBeenCalledExactlyOnceWith({
			giphyConsent: true,
		});
		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 0,
		});
		expect(tile("Trending a")).toBeTruthy();
	});

	it("keeps the note up and reports a failed save", async () => {
		preferences.values.set("giphyConsent", false);
		preferences.setPreferences.mockRejectedValue(new Error("disk full"));
		await mount();

		await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		await settle();

		expect(toast.error).toHaveBeenCalledWith(
			"Failed to save preferences",
			expect.anything(),
		);
		expect(api.getTrendingGifs).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty(
			"disabled",
			false,
		);
	});

	it("waits for its tab before loading trending", async () => {
		const { rerender } = await mount({ active: false });
		expect(api.getTrendingGifs).not.toHaveBeenCalled();

		await rerender({ active: true });
		await settle();

		expect(api.getTrendingGifs).toHaveBeenCalledOnce();
	});

	it("marks its tiles as GIFs only when reduced motion holds them still", async () => {
		await mount();
		expect(screen.queryAllByText("GIF")).toHaveLength(0);
		cleanup();

		reducedMotion.current = true;
		await mount();

		expect(screen.getAllByText("GIF")).toHaveLength(2);
	});

	it("presses only the GIF its menu has picked", async () => {
		const { rerender } = await mount({ pickedId: "b" });
		expect(pressed("Trending a")).toBe("false");
		expect(pressed("Trending b")).toBe("true");

		await rerender({ pickedId: "a" });
		expect(pressed("Trending a")).toBe("true");
		expect(pressed("Trending b")).toBe("false");

		await rerender({ pickedId: null });
		expect(pressed("Trending a")).toBe("false");
		expect(pressed("Trending b")).toBe("false");
	});

	it("rewinds the sheet when the query changes", async () => {
		await mount();
		onFeedRestart.mockClear();

		await fireEvent.input(screen.getByRole("searchbox"), {
			target: { value: "cat" },
		});

		expect(onFeedRestart).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "Trending a" })).toBeNull();
	});

	it("clears the search box from its clear button", async () => {
		await mount();
		expect(
			screen.queryByRole("button", { name: "Clear search" }),
		).toBeNull();
		await fireEvent.input(screen.getByRole("searchbox"), {
			target: { value: "cat" },
		});
		api.getTrendingGifs.mockClear();

		await fireEvent.click(
			screen.getByRole("button", { name: "Clear search" }),
		);
		await settle();

		expect(screen.getByRole("searchbox")).toHaveProperty("value", "");
		expect(api.getTrendingGifs).toHaveBeenCalledExactlyOnceWith({
			offset: 0,
		});
		expect(tile("Trending a")).toBeTruthy();
	});

	it("searches right away on Enter", async () => {
		await mount();
		const searchbox = screen.getByRole("searchbox");
		await fireEvent.input(searchbox, { target: { value: "cat" } });

		await fireEvent.keyDown(searchbox, { key: "Enter" });
		await settle();

		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "cat",
			offset: 0,
		});
		expect(screen.getByText("No GIFs found")).toBeTruthy();
	});

	it("searches pasted text right away", async () => {
		await mount();
		const searchbox = screen.getByRole<HTMLInputElement>("searchbox");
		searchbox.value = "cat";

		searchbox.dispatchEvent(
			new InputEvent("input", {
				inputType: "insertFromPaste",
				bubbles: true,
			}),
		);
		await settle();

		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "cat",
			offset: 0,
		});
	});

	it("leaves the search to the debounce when Enter confirms an IME conversion", async () => {
		await mount();
		const searchbox = screen.getByRole("searchbox");
		searchbox.focus();
		await fireEvent.input(searchbox, { target: { value: "cat" } });

		await fireEvent.keyDown(searchbox, { key: "Enter", keyCode: 229 });
		await settle();

		expect(document.activeElement).toBe(searchbox);
		expect(api.searchGifs).not.toHaveBeenCalled();

		await fireEvent.keyDown(searchbox, { key: "Enter" });
		await settle();

		expect(document.activeElement).not.toBe(searchbox);
		expect(api.searchGifs).toHaveBeenCalledExactlyOnceWith({
			query: "cat",
			offset: 0,
		});
	});

	it("hides its tiles while another tab is open and brings them back", async () => {
		api.searchGifs.mockResolvedValue(trendingPage(["s1"]));
		const { rerender } = await mount();
		const searchbox = screen.getByRole("searchbox");
		await fireEvent.input(searchbox, { target: { value: "cat" } });
		await fireEvent.keyDown(searchbox, { key: "Enter" });
		await settle();
		expect(screen.getByRole("img", { name: "Trending s1" })).toBeTruthy();

		await rerender({ active: false });
		await settle();

		expect(screen.queryByRole("img", { name: "Trending s1" })).toBeNull();
		expect(screen.getByRole("searchbox")).toHaveProperty("value", "cat");

		await rerender({ active: true });
		await settle();

		expect(screen.getByRole("img", { name: "Trending s1" })).toBeTruthy();
		expect(tile("Trending s1")).toBeTruthy();
		expect(api.getTrendingGifs).toHaveBeenCalledOnce();
		expect(api.searchGifs).toHaveBeenCalledOnce();
	});

	it("offers a retry without blaming Grindr when GIPHY fails", async () => {
		api.getTrendingGifs.mockRejectedValueOnce(
			new Error("Request blocked by Grindr"),
		);
		await mount();

		expect(screen.getByText("Couldn't load GIFs")).toBeTruthy();
		expect(screen.queryByText(/Grindr/)).toBeNull();

		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await settle();

		expect(tile("Trending a")).toBeTruthy();
	});

	it("hands a tapped GIF to its menu as a Giphy message", async () => {
		await mount();

		await fireEvent.click(tile("Trending b"));

		expect(onPick).toHaveBeenCalledExactlyOnceWith({
			id: "b",
			message: {
				type: "Giphy",
				body: {
					id: "b",
					urlPath: "https://media.giphy.com/media/b/200.gif",
					previewPath: "https://media.giphy.com/media/b/200.gif",
					stillPath: "https://media.giphy.com/media/b/200_s.gif",
					width: 200,
					height: 150,
					imageHash: "giphy/b",
				},
			},
		});
		expect(pressed("Trending b")).toBe("false");
	});
});
