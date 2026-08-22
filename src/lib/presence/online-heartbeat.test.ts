import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appLifecycle, gridState, preferences, refreshMock } = vi.hoisted(() => {
	const refresh = vi.fn();
	return {
		appLifecycle: { active: true },
		gridState: { refresh, viewActive: false },
		preferences: { loaded: true, stayOnline: true },
		refreshMock: refresh,
	};
});

vi.mock("$lib/api/app-lifecycle.svelte", () => ({ appLifecycle }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferencesSnapshot: () => ({ stayOnline: preferences.stayOnline }),
	preferencesLoaded: () => preferences.loaded,
}));
vi.mock("$lib/grid/grid-state.svelte", () => ({ gridState }));

import { clearAccountCaches } from "$lib/api/account-caches";
import { markOnlineRefreshed } from "./online-clock";
import {
	ONLINE_REFRESH_AFTER_MS,
	startOnlineHeartbeat,
} from "./online-heartbeat";

const MINUTE = 60 * 1000;

function setHidden(hidden: boolean): void {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		get: () => hidden,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	clearAccountCaches();
	refreshMock.mockReset().mockImplementation(() => {
		markOnlineRefreshed();
		return Promise.resolve();
	});
	appLifecycle.active = true;
	gridState.viewActive = false;
	preferences.loaded = true;
	preferences.stayOnline = true;
	setHidden(false);
});

afterEach(() => {
	vi.useRealTimers();
});

async function withHeartbeat(run: () => Promise<void>): Promise<void> {
	const stop = startOnlineHeartbeat();
	try {
		await run();
	} finally {
		stop();
	}
}

describe("startOnlineHeartbeat", () => {
	it("beats on the first tick, then once per online window", async () => {
		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledExactlyOnceWith({
				background: true,
			});

			await vi.advanceTimersByTimeAsync(ONLINE_REFRESH_AFTER_MS - MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();

			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledTimes(2);
		});
	});

	it("lets grid browsing hold the window open on its own", async () => {
		await withHeartbeat(async () => {
			markOnlineRefreshed();

			await vi.advanceTimersByTimeAsync(ONLINE_REFRESH_AFTER_MS - MINUTE);
			expect(refreshMock).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();
		});
	});

	it("retries on the next minute when the cascade failed", async () => {
		refreshMock.mockImplementation(() => Promise.resolve());

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();

			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledTimes(2);
		});
	});

	it("stays quiet while the app is in the background", async () => {
		setHidden(true);

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(2 * MINUTE);
			expect(refreshMock).not.toHaveBeenCalled();

			setHidden(false);
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();
		});
	});

	it("stays quiet while the native lifecycle reports inactive", async () => {
		appLifecycle.active = false;

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(2 * MINUTE);
			expect(refreshMock).not.toHaveBeenCalled();
		});
	});

	it("stays quiet when the preference is off", async () => {
		preferences.stayOnline = false;

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(2 * MINUTE);
			expect(refreshMock).not.toHaveBeenCalled();
		});
	});

	it("still refreshes an open grid when the preference is off", async () => {
		preferences.stayOnline = false;
		gridState.viewActive = true;

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();
		});
	});

	it("waits for preferences instead of beating on the default", async () => {
		preferences.loaded = false;

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(2 * MINUTE);
			expect(refreshMock).not.toHaveBeenCalled();

			preferences.loaded = true;
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();
		});
	});

	it("stops beating once the disposer runs", async () => {
		const stop = startOnlineHeartbeat();
		await vi.advanceTimersByTimeAsync(MINUTE);
		stop();

		await vi.advanceTimersByTimeAsync(10 * MINUTE);

		expect(refreshMock).toHaveBeenCalledOnce();
	});

	it("forgets the window when the account is cleared", async () => {
		markOnlineRefreshed();
		clearAccountCaches();

		await withHeartbeat(async () => {
			await vi.advanceTimersByTimeAsync(MINUTE);
			expect(refreshMock).toHaveBeenCalledOnce();
		});
	});
});
