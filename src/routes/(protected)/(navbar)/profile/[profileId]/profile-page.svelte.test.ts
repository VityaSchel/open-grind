import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationType } from "@sveltejs/kit";

import { WIDTH } from "$lib/util/snap-pager-test-helpers";
import type { Profile } from "$lib/model/users/profiles";
import ProfilePage from "./+page.svelte";
import {
	flush,
	fullProfile,
	gridSource,
	OUR_ID,
} from "./pager/profile-pager-test-helpers";

const A = 100001;
const B = 100002;
const C = 100003;
const D = 100004;

const {
	getProfileMock,
	recordProfileViewMock,
	profileMediaUrlMock,
	isPhotoSwipeBusyMock,
	goto,
	afterNavigate,
	navigating,
	page,
	grid,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn<(profileId: number) => Promise<Profile>>(),
	recordProfileViewMock:
		vi.fn<(view: { profileId: number }) => Promise<void>>(),
	profileMediaUrlMock: vi.fn(
		({ mediaHash, size }: { mediaHash: string; size: string }) =>
			`https://cdn.test/${size}/${mediaHash}`,
	),
	isPhotoSwipeBusyMock: vi.fn<() => boolean>(),
	goto: vi.fn<(...args: unknown[]) => Promise<void>>(),
	afterNavigate: vi.fn<(callback: () => void) => void>(),
	navigating: {
		type: null as NavigationType | null,
		to: null as { url: URL } | null,
	},
	page: {
		params: { profileId: "" },
		state: {},
		url: new URL("https://app.test/"),
	},
	grid: { source: null as ReturnType<typeof gridSource> | null },
}));

vi.mock("$app/navigation", () => ({ goto, afterNavigate }));
vi.mock("$app/state", () => ({ navigating, page }));
vi.mock("$lib/grid/grid-state.svelte", () => ({
	get gridState() {
		return grid.source;
	},
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
}));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/api/interest/views", () => ({
	recordProfileView: recordProfileViewMock,
}));
vi.mock("$lib/app-data/preferences.svelte", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("$lib/app-data/preferences.svelte")
	>()),
	getPreferences: () => Promise.resolve({ revealProfileViews: true }),
}));
vi.mock("$lib/util/media", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/util/media")>()),
	profileMediaUrl: profileMediaUrlMock,
}));
vi.mock("$lib/util/photoswipe", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/util/photoswipe")>()),
	isPhotoSwipeBusy: isPhotoSwipeBusyMock,
}));
vi.mock("$lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: () => {},
}));

const COMMIT = {
	replaceState: true,
	noScroll: true,
	keepFocus: true,
	state: { profileOrigin: "browse" },
};

const resizeCallbacks = new Map<Element, ResizeObserverCallback>();

async function openProfile({
	gridIds,
	profileId,
	origin,
}: {
	gridIds: number[];
	profileId: number;
	origin?: "browse";
}) {
	grid.source = gridSource({ ids: gridIds });
	page.params.profileId = String(profileId);
	page.state = origin ? { profileOrigin: origin } : {};
	page.url = new URL(`https://app.test/profile/${profileId}`);
	window.history.replaceState(null, "", `/profile/${profileId}`);

	const { container } = render(ProfilePage, {
		props: {
			params: { profileId: String(profileId) },
			data: { ourProfileId: OUR_ID },
		},
	});
	const host = container.querySelector<HTMLElement>(
		'[data-slot="profile-pager"]',
	);
	if (!host) throw new Error("profile pager not mounted");
	Object.defineProperty(host, "clientWidth", {
		get: () => Math.round(WIDTH),
	});
	resizeCallbacks.get(host)?.(
		[
			{
				contentBoxSize: [{ inlineSize: WIDTH, blockSize: 800 }],
			} as unknown as ResizeObserverEntry,
		],
		{} as ResizeObserver,
	);
	await flush();

	return {
		host,
		panes: () =>
			[
				...host.querySelectorAll<HTMLElement>(
					'[data-slot="profile-pane"]',
				),
			].map((section) => ({
				section,
				left: section.style.left,
				name: section.querySelector("h1")?.textContent.trim(),
				active: !section.hasAttribute("aria-hidden"),
			})),
		scroll: async (left: number) => {
			host.scrollLeft = left;
			host.dispatchEvent(new Event("scroll"));
			await flush();
		},
	};
}

const fetchedIds = () => getProfileMock.mock.calls.map(([id]) => id);

const viewedIds = () =>
	recordProfileViewMock.mock.calls.map(([{ profileId }]) => profileId);

beforeEach(() => {
	vi.clearAllMocks();
	navigating.type = null;
	navigating.to = null;
	resizeCallbacks.clear();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			readonly #callback: ResizeObserverCallback;
			constructor(callback: ResizeObserverCallback) {
				this.#callback = callback;
			}
			observe(target: Element) {
				resizeCallbacks.set(target, this.#callback);
			}
			unobserve() {}
			disconnect() {}
		},
	);
	getProfileMock.mockImplementation((profileId: number) =>
		Promise.resolve(
			fullProfile({
				profileId,
				displayName: `Loaded ${profileId}`,
				mediaHashes: [`photo-${profileId}`],
			}),
		),
	);
	recordProfileViewMock.mockResolvedValue(undefined);
	isPhotoSwipeBusyMock.mockReturnValue(false);
	goto.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("the profile page entered from Browse", () => {
	it("loads both neighbors but records a view only for the opened profile", async () => {
		await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});

		expect(fetchedIds().toSorted((left, right) => left - right)).toEqual([
			A,
			B,
			C,
		]);
		expect(viewedIds()).toEqual([B]);
	});

	it("keeps both neighbors out of assistive tech and input", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});

		expect(
			pager
				.panes()
				.map(({ left, name, active }) => ({ left, name, active })),
		).toEqual([
			{ left: "0%", name: `Loaded ${A}`, active: false },
			{ left: "100%", name: `Loaded ${B}`, active: true },
			{ left: "200%", name: `Loaded ${C}`, active: false },
		]);
		for (const { section, active } of pager.panes())
			expect(section.querySelector("main")!.inert).toBe(!active);
		expect(
			pager.host.querySelectorAll('[data-slot="profile-scroller"]'),
		).toHaveLength(1);
	});

	it("shows every pane's photo at full size, never the grid thumbnail", async () => {
		await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});

		const sizes = profileMediaUrlMock.mock.calls.map(([{ size }]) => size);
		const hashes = profileMediaUrlMock.mock.calls.map(
			([{ mediaHash }]) => mediaHash,
		);
		expect(new Set(hashes)).toEqual(
			new Set([`photo-${A}`, `photo-${B}`, `photo-${C}`]),
		);
		expect(new Set(sizes)).toEqual(new Set(["full"]));
	});

	it("commits the profile the pager comes to rest on", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});

		await pager.scroll(2 * WIDTH);

		expect(goto).toHaveBeenCalledExactlyOnceWith(`/profile/${C}`, COMMIT);
		expect(viewedIds()).toEqual([B, C]);
		expect(pager.panes().find(({ active }) => active)?.left).toBe("200%");
	});

	it("commits nothing while a traversal is in flight", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});
		navigating.type = "popstate";
		navigating.to = { url: new URL("https://app.test/") };

		await pager.scroll(2 * WIDTH);

		expect(goto).not.toHaveBeenCalled();
		expect(viewedIds()).toEqual([B]);
		expect(pager.panes().find(({ active }) => active)?.left).toBe("100%");
	});

	it("commits a rest a traversal held back once that navigation ends", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});
		navigating.type = "popstate";
		navigating.to = { url: new URL("https://app.test/") };
		await pager.scroll(2 * WIDTH);
		expect(goto).not.toHaveBeenCalled();

		navigating.type = null;
		navigating.to = null;
		for (const [navigated] of afterNavigate.mock.calls) navigated();
		await flush();

		expect(goto).toHaveBeenCalledExactlyOnceWith(`/profile/${C}`, COMMIT);
		expect(viewedIds()).toEqual([B, C]);
	});

	it("commits nothing while the photo viewer is open", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});
		isPhotoSwipeBusyMock.mockReturnValue(true);

		await pager.scroll(2 * WIDTH);

		expect(goto).not.toHaveBeenCalled();
		expect(viewedIds()).toEqual([B]);
	});

	it("replaces its own commit that is still loading", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C],
			profileId: B,
			origin: "browse",
		});

		await pager.scroll(2 * WIDTH);
		navigating.type = "goto";
		navigating.to = { url: new URL(`https://app.test/profile/${C}`) };
		await pager.scroll(WIDTH);

		expect(goto.mock.calls).toEqual([
			[`/profile/${C}`, COMMIT],
			[`/profile/${B}`, COMMIT],
		]);
		expect(viewedIds()).toEqual([B, C]);
	});

	it("loads the profile after next as soon as the pager leaves the open one", async () => {
		const pager = await openProfile({
			gridIds: [A, B, C, D],
			profileId: B,
			origin: "browse",
		});

		await pager.scroll(WIDTH + 0.5);
		expect(fetchedIds()).not.toContain(D);

		await pager.scroll(WIDTH + 2);
		expect(fetchedIds()).toContain(D);
		expect(viewedIds()).toEqual([B]);
	});
});

describe("the profile page entered from anywhere else", () => {
	it("opens the profile alone", async () => {
		const pager = await openProfile({ gridIds: [A, B, C], profileId: B });

		expect(
			pager.host.querySelectorAll('[data-slot="profile-pager-stop"]'),
		).toHaveLength(1);
		expect(pager.panes().map(({ name }) => name)).toEqual([`Loaded ${B}`]);
		expect(fetchedIds()).toEqual([B]);
		expect(viewedIds()).toEqual([B]);
	});
});
