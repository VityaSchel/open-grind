import { flushSync } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	deeplink,
	foldedResumeHandlers,
	getGridMock,
	openedListeners,
	preferenceWrites,
	reconcileHandlers,
	storedPreferences,
} = vi.hoisted(() => ({
	deeplink: { ahead: false, checked: Promise.resolve() },
	foldedResumeHandlers: [] as (() => unknown)[],
	getGridMock: vi.fn(),
	openedListeners: new Set<() => void>(),
	reconcileHandlers: [] as ((cause: string) => unknown)[],
	storedPreferences: { geohash: null, loaded: true, stayOnline: false },
	preferenceWrites: { bump: () => {}, read: () => {} },
}));

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	patchCachedProfile: vi.fn(),
	resolveLazyProfile: vi.fn(),
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe: (
			handler: (cause: string) => unknown,
			options?: { onFoldedResume?: () => unknown },
		) => {
			reconcileHandlers.push(handler);
			if (options?.onFoldedResume)
				foldedResumeHandlers.push(options.onFoldedResume);
			return () => {};
		},
	},
}));
vi.mock("$lib/app-data/preferences.svelte", async () => {
	const { SvelteMap } = await import("svelte/reactivity");
	const revision = new SvelteMap([["writes", 0]]);
	preferenceWrites.read = () => void revision.get("writes");
	preferenceWrites.bump = () =>
		revision.set("writes", (revision.get("writes") ?? 0) + 1);
	return {
		getPreferences: () => Promise.resolve({}),
		preferencesLoaded: () => storedPreferences.loaded,
		preferencesSnapshot: () => {
			preferenceWrites.read();
			return storedPreferences;
		},
		setPreferences: vi.fn(() => Promise.resolve()),
	};
});
vi.mock("$lib/push/opening-deeplink", () => ({
	pushDeeplinkAhead: async () => {
		await deeplink.checked;
		return deeplink.ahead;
	},
	untilPushDeeplinkOpened: () =>
		new Promise<void>((resolve) => openedListeners.add(resolve)),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: {
		resolveGeohash: (geohash: string) => Promise.resolve(geohash),
	},
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { markProfileViewable } from "$lib/api/users/profile-viewability";
import { gridState } from "./grid-state.svelte";

const GEOHASH = "9q8yyk8ytpxr";

const page = (ids: number[]) => ({
	items: ids.map((id) => ({ id, type: "lazy" })),
	nextPage: null,
});

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

const drain = () => new Promise((resolve) => setTimeout(resolve));

function openNotification() {
	for (const listener of [...openedListeners]) listener();
	openedListeners.clear();
}

function holdNotificationCheck(): () => void {
	let release!: () => void;
	deeplink.checked = new Promise((resolve) => {
		release = () => resolve();
	});
	return release;
}

beforeEach(async () => {
	clearAccountCaches();
	storedPreferences.stayOnline = false;
	deeplink.ahead = false;
	deeplink.checked = Promise.resolve();
	openedListeners.clear();
	gridState.viewActive = false;
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([1]));
	gridState.reset();
	gridState.load(GEOHASH);
	await settle();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([2]));
});

describe("grid while Stay online is off", () => {
	it("refreshes on returning to the app while the grid is on screen", async () => {
		const detach = gridState.attachView();
		await reconcileHandlers[0]?.("resume");
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("leaves the grid alone on returning to the app elsewhere", async () => {
		await reconcileHandlers[0]?.("resume");

		expect(getGridMock).not.toHaveBeenCalled();
	});

	it("leaves the grid alone on a return that opens a notification", async () => {
		deeplink.ahead = true;
		const detach = gridState.attachView();
		await reconcileHandlers[0]?.("resume");
		detach();

		expect(getGridMock).not.toHaveBeenCalled();
	});

	it("never refreshes the grid on screen for a reconnect or a resync", async () => {
		const detach = gridState.attachView();
		await reconcileHandlers[0]?.("reconnect");
		await reconcileHandlers[0]?.("resync");
		detach();

		expect(getGridMock).not.toHaveBeenCalled();
	});

	it("catches up once on showing a grid that missed a reconnect", async () => {
		await reconcileHandlers[0]?.("reconnect");

		const detach = gridState.attachView();
		await settle();
		detach();
		gridState.attachView()();

		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("catches up the grid on screen when a return lands right after a reconnect", async () => {
		const detach = gridState.attachView();
		await reconcileHandlers[0]?.("reconnect");
		expect(getGridMock).not.toHaveBeenCalled();

		await foldedResumeHandlers[0]?.();
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("waits for the grid to be shown before refetching for an unblock", async () => {
		markProfileViewable(1);
		expect(gridState.refreshing).toBe(false);
		await drain();
		expect(getGridMock).not.toHaveBeenCalled();

		const detach = gridState.attachView();
		await settle();
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("skips the first load while a notification opens, then loads if the app stays on the grid", async () => {
		gridState.reset();
		deeplink.ahead = true;
		const detach = gridState.attachView();
		gridState.load(GEOHASH);
		await drain();

		expect(getGridMock).not.toHaveBeenCalled();
		expect(gridState.loading).toBe(true);

		openNotification();
		await settle();
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("leaves the first load for later when the notification led elsewhere", async () => {
		gridState.reset();
		deeplink.ahead = true;
		gridState.load(GEOHASH);
		await drain();

		openNotification();
		await drain();

		expect(getGridMock).not.toHaveBeenCalled();
		expect(gridState.loading).toBe(false);
	});

	it("drops a first load that a reset superseded while checking for a notification", async () => {
		gridState.reset();
		const release = holdNotificationCheck();
		gridState.load(GEOHASH);
		gridState.reset();

		release();
		await drain();

		expect(getGridMock).not.toHaveBeenCalled();
	});

	it("keeps waiting for a notification when a grid that missed a refresh is shown", async () => {
		gridState.reset();
		deeplink.ahead = true;
		gridState.load(GEOHASH);
		await reconcileHandlers[0]?.("reconnect");
		const detach = gridState.attachView();
		await drain();
		expect(getGridMock).not.toHaveBeenCalled();

		openNotification();
		await settle();
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
	});
});

describe("grid loading in an effect", () => {
	it("keeps a preference write from restarting a grid that has no profiles yet", async () => {
		gridState.reset();
		getGridMock.mockResolvedValue(page([]));
		const stop = $effect.root(() => {
			$effect.pre(() => gridState.load(GEOHASH));
		});
		await settle();

		preferenceWrites.bump();
		flushSync();
		await drain();
		stop();

		expect(getGridMock).toHaveBeenCalledOnce();
	});
});

describe("grid while Stay online is on", () => {
	it("refreshes once when a return lands right after a reconnect", async () => {
		storedPreferences.stayOnline = true;
		const detach = gridState.attachView();

		await reconcileHandlers[0]?.("reconnect");
		await foldedResumeHandlers[0]?.();
		detach();

		expect(getGridMock).toHaveBeenCalledOnce();
	});
});
