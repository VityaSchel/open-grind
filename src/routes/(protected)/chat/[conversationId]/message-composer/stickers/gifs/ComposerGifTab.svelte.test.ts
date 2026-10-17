// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GiphyPage } from "$lib/api/messaging/giphy";
import type { MessageDraft } from "$lib/model/messaging/messages";

const api = vi.hoisted(() => ({
	getTrendingGifs:
		vi.fn<(params: { offset: number }) => Promise<GiphyPage>>(),
	searchGifs:
		vi.fn<
			(params: { query: string; offset: number }) => Promise<GiphyPage>
		>(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
const composer = vi.hoisted(() => ({
	sendMessages: vi.fn<(drafts: MessageDraft[]) => void>(),
}));
const preferences = vi.hoisted(() => ({
	values: new Map<string, boolean>(),
	setPreferences:
		vi.fn<(values: { giphyConsent: boolean }) => Promise<void>>(),
}));

vi.mock("$lib/api/messaging/giphy", () => api);
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
vi.mock("../../message-composer-context.svelte", () => ({
	getMessageComposerContext: () => () => composer,
}));

import type { TabSelection } from "../../attachments/tabs";
import ComposerGifTab from "./ComposerGifTab.svelte";

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
		gifs: ids.map((id) => ({
			id,
			tileUrl: `https://media.giphy.com/media/${id}/200w.webp`,
			alt: `Trending ${id}`,
			body: {
				id,
				urlPath: `https://media.giphy.com/media/${id}/200.gif`,
				previewPath: `https://media.giphy.com/media/${id}/200.gif`,
				stillPath: `https://media.giphy.com/media/${id}/200_s.gif`,
				width: 200,
				height: 150,
				imageHash: `giphy/${id}`,
			},
		})),
		nextOffset: null,
	};
}

const onClose = vi.fn<() => void>();
const onFeedRestart = vi.fn<() => void>();
let selections: TabSelection[];

async function settle() {
	await tick();
	await Promise.resolve();
	await tick();
}

async function mount({ active = true } = {}) {
	const rendered = render(ComposerGifTab, {
		props: {
			active,
			onClose,
			onFeedRestart,
			onSelectionChange: (selection: TabSelection) => {
				selections.push(selection);
			},
		},
	});
	await settle();
	return rendered;
}

const tile = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
	selections = [];
	onClose.mockReset();
	onFeedRestart.mockReset();
	toast.mockReset();
	toast.error.mockReset();
	composer.sendMessages.mockReset();
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

	it("selects one GIF at a time and offers to send it", async () => {
		await mount();

		await fireEvent.click(tile("Trending a"));
		await fireEvent.click(tile("Trending b"));

		expect(selections.at(-1)).toEqual({ count: 1, label: "Send GIF" });
		expect(tile("Trending a").getAttribute("aria-pressed")).toBe("false");
		expect(tile("Trending b").getAttribute("aria-pressed")).toBe("true");
	});

	it("clears the selection and rewinds the sheet when the query changes", async () => {
		await mount();
		await fireEvent.click(tile("Trending a"));
		onFeedRestart.mockClear();

		await fireEvent.input(screen.getByRole("searchbox"), {
			target: { value: "cat" },
		});

		expect(selections.at(-1)).toEqual({ count: 0, label: "Send GIF" });
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

	it("sends the picked GIF as a Giphy message and closes", async () => {
		const { component } = await mount();
		await fireEvent.click(tile("Trending b"));

		component.submitSelection();

		const message = {
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
		};
		expect(composer.sendMessages).toHaveBeenCalledExactlyOnceWith([
			{ outbound: message, optimistic: message },
		]);
		expect(onClose).toHaveBeenCalledOnce();
		expect(selections.at(-1)).toEqual({ count: 0, label: "Send GIF" });
	});

	it("only closes when nothing is picked", async () => {
		const { component } = await mount();

		component.submitSelection();

		expect(onClose).toHaveBeenCalledOnce();
		expect(composer.sendMessages).not.toHaveBeenCalled();
	});
});
