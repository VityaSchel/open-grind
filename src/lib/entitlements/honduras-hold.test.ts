import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setVisibility } from "$lib/test/visibility";

const mocks = vi.hoisted(() => ({
	journal: [] as string[],
	files: new Set<string>(),
	HONDURAS: "d4b1hqtcyz1k",
	HOME: "u33dc0cpnp0m",
	updateLocation: vi.fn<(args: { geohash: string }) => Promise<void>>(),
	callMethod: vi.fn<(method: string, args?: unknown) => Promise<unknown>>(),
	reconnect: vi.fn<() => Promise<void>>(),
	onSignOut: vi.fn<(release: () => Promise<void>) => void>(),
	getPreferences: vi.fn<() => Promise<{ geohash: string | null }>>(),
	isMobilePlatform: vi.fn<() => boolean>(),
	writeAppDataFileAtomic:
		vi.fn<(args: { path: string; content: Uint8Array }) => Promise<void>>(),
	existsAppDataFile: vi.fn<(path: string) => Promise<boolean>>(),
	removeAppDataFile: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock("$lib/api/browse/location", () => ({
	updateLocation: mocks.updateLocation,
}));
vi.mock("$lib/api/methods", () => ({ callMethod: mocks.callMethod }));
vi.mock("$lib/api/sign-out", () => ({ onSignOut: mocks.onSignOut }));
vi.mock("$lib/ws.svelte", () => ({ ws: { reconnect: mocks.reconnect } }));
vi.mock("$lib/platform/os", () => ({
	isMobilePlatform: mocks.isMobilePlatform,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: mocks.getPreferences,
}));
vi.mock("$lib/app-data", () => ({
	writeAppDataFileAtomic: mocks.writeAppDataFileAtomic,
	existsAppDataFile: mocks.existsAppDataFile,
	removeAppDataFile: mocks.removeAppDataFile,
}));
vi.mock("./honduras", () => ({ randomHondurasGeohash: () => mocks.HONDURAS }));

const MARKER = "honduras-hold.data";
const HOLD_TIMEOUT_MS = 15_000;
const SETTLE_WAIT_MS = 10_000;
const RETRY_MS = 60_000;

let hold: typeof import("./honduras-hold");
let accounts: typeof import("$lib/api/account-caches");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function signOutHook(): () => Promise<void> {
	const [release] = mocks.onSignOut.mock.lastCall ?? [];
	if (!release) throw new Error("the hold registered no sign-out hook");
	return release;
}

async function takeHold() {
	const taken = await hold.holdInHonduras({ home: mocks.HOME });
	if (taken === null) throw new Error("expected a hold");
	return taken;
}

function movesHome(): number {
	return mocks.updateLocation.mock.calls.filter(
		([{ geohash }]) => geohash === mocks.HOME,
	).length;
}

beforeEach(async () => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.journal.length = 0;
	mocks.files.clear();
	mocks.updateLocation.mockImplementation(({ geohash }) => {
		mocks.journal.push(
			geohash === mocks.HONDURAS ? "move:hn" : "move:home",
		);
		return Promise.resolve();
	});
	mocks.callMethod.mockImplementation(() => {
		mocks.journal.push("refresh");
		return Promise.resolve({ profileId: 1 });
	});
	mocks.reconnect.mockImplementation(() => {
		mocks.journal.push("reconnect");
		return Promise.resolve();
	});
	mocks.writeAppDataFileAtomic.mockImplementation(({ path }) => {
		mocks.journal.push("mark");
		mocks.files.add(path);
		return Promise.resolve();
	});
	mocks.existsAppDataFile.mockImplementation((path) =>
		Promise.resolve(mocks.files.has(path)),
	);
	mocks.removeAppDataFile.mockImplementation((path) => {
		if (mocks.files.delete(path)) mocks.journal.push("unmark");
		return Promise.resolve();
	});
	mocks.getPreferences.mockResolvedValue({ geohash: mocks.HOME });
	mocks.isMobilePlatform.mockReturnValue(false);
	vi.spyOn(console, "error").mockImplementation(() => {});
	hold = await import("./honduras-hold");
	accounts = await import("$lib/api/account-caches");
});

afterEach(() => {
	vi.useRealTimers();
	setVisibility("visible");
});

describe("holdInHonduras", () => {
	it("marks the hold, moves to Honduras, reissues the session there and reconnects", async () => {
		const taken = await takeHold();

		expect(mocks.journal).toEqual([
			"mark",
			"move:hn",
			"refresh",
			"reconnect",
		]);
		expect(mocks.callMethod).toHaveBeenCalledWith("refresh_session", {
			geohash: mocks.HONDURAS,
		});
		await taken.lease().release();
	});

	it("stays in Honduras until the last lease is released, then moves home and forgets the marker", async () => {
		const taken = await takeHold();
		const first = taken.lease();
		const second = taken.lease();

		await first.release();
		await first.release();
		expect(mocks.journal).not.toContain("move:home");

		await second.release();
		await taken.ended;
		expect(mocks.journal.slice(-2)).toEqual(["move:home", "unmark"]);
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("moves home when the hold times out while a lease is still held", async () => {
		vi.useFakeTimers();
		const taken = await takeHold();
		const lease = taken.lease();

		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);

		expect(mocks.journal.slice(-2)).toEqual(["move:home", "unmark"]);
		await lease.release();
		expect(movesHome()).toBe(1);
	});

	it("gives up on a reissue that never answers and moves home", async () => {
		vi.useFakeTimers();
		mocks.callMethod.mockReturnValue(new Promise(() => {}));

		const outcome = expect(
			hold.holdInHonduras({ home: mocks.HOME }),
		).rejects.toThrow("ended before it was granted");
		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);
		await outcome;

		expect(mocks.journal).toEqual([
			"mark",
			"move:hn",
			"move:home",
			"unmark",
		]);
		expect(mocks.reconnect).not.toHaveBeenCalled();
	});

	it("moves home when the session reissue fails", async () => {
		mocks.callMethod.mockRejectedValue(new Error("offline"));

		await expect(hold.holdInHonduras({ home: mocks.HOME })).rejects.toThrow(
			"offline",
		);
		await hold.awaitHomeLocation();

		expect(mocks.journal).toEqual([
			"mark",
			"move:hn",
			"move:home",
			"unmark",
		]);
	});

	it("moves home when the move to Honduras fails", async () => {
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));

		await expect(hold.holdInHonduras({ home: mocks.HOME })).rejects.toThrow(
			"offline",
		);
		await hold.awaitHomeLocation();

		expect(mocks.updateLocation).toHaveBeenLastCalledWith({
			geohash: mocks.HOME,
		});
		expect(mocks.callMethod).not.toHaveBeenCalled();
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("never leaves home when the marker cannot be written", async () => {
		mocks.writeAppDataFileAtomic.mockRejectedValue(new Error("disk full"));

		await expect(hold.holdInHonduras({ home: mocks.HOME })).rejects.toThrow(
			"disk full",
		);
		await hold.awaitHomeLocation();

		expect(mocks.journal).not.toContain("move:hn");
		expect(mocks.callMethod).not.toHaveBeenCalled();
	});

	it("waits for its own move to Honduras to land before moving home", async () => {
		vi.useFakeTimers();
		const moveOut = Promise.withResolvers<void>();
		mocks.updateLocation.mockImplementationOnce(() => moveOut.promise);
		const outcome = expect(
			hold.holdInHonduras({ home: mocks.HOME }),
		).rejects.toThrow("ended before it was granted");

		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);
		await outcome;
		expect(movesHome()).toBe(0);

		moveOut.resolve();
		await vi.advanceTimersByTimeAsync(0);

		expect(mocks.updateLocation).toHaveBeenLastCalledWith({
			geohash: mocks.HOME,
		});
		expect(mocks.callMethod).not.toHaveBeenCalled();
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("never leaves home when the hold ends while a grid request keeps it waiting", async () => {
		vi.useFakeTimers();
		const cascade = Promise.withResolvers<void>();
		const inFlight = hold.atHomeLocation(() => cascade.promise);
		await vi.advanceTimersByTimeAsync(0);
		const outcome = expect(
			hold.holdInHonduras({ home: mocks.HOME }),
		).rejects.toThrow("ended before it was granted");

		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);
		await outcome;
		cascade.resolve();
		await inFlight;
		await vi.advanceTimersByTimeAsync(0);

		expect(mocks.journal).toEqual([]);
	});

	it("never moves to Honduras when sign-out lands during the marker write", async () => {
		const marking = Promise.withResolvers<void>();
		mocks.writeAppDataFileAtomic.mockImplementationOnce(({ path }) => {
			mocks.files.add(path);
			return marking.promise;
		});
		const taking = hold.holdInHonduras({ home: mocks.HOME });
		await vi.waitFor(() =>
			expect(mocks.writeAppDataFileAtomic).toHaveBeenCalled(),
		);

		const signingOut = signOutHook()();
		marking.resolve();
		await signingOut;

		await expect(taking).resolves.toBeNull();
		expect(mocks.journal).not.toContain("move:hn");
		expect(mocks.callMethod).not.toHaveBeenCalled();
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("still hands out leases when the hold ends after the session was reissued", async () => {
		vi.useFakeTimers();
		const reconnecting = Promise.withResolvers<void>();
		mocks.reconnect.mockReturnValue(reconnecting.promise);
		const taking = hold.holdInHonduras({ home: mocks.HOME });

		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);
		reconnecting.resolve();
		const taken = await taking;

		expect(taken).not.toBeNull();
		await taken?.lease().release();
		expect(movesHome()).toBe(1);
	});

	it("stops waiting for a slow socket once the hold has timed out", async () => {
		vi.useFakeTimers();
		mocks.reconnect.mockReturnValue(new Promise(() => {}));
		let taken: Awaited<ReturnType<typeof hold.holdInHonduras>> = null;
		void hold.holdInHonduras({ home: mocks.HOME }).then((result) => {
			taken = result;
		});

		await vi.advanceTimersByTimeAsync(HOLD_TIMEOUT_MS);

		expect(taken).not.toBeNull();
		expect(movesHome()).toBe(1);
	});

	it("returns no hold when the account signs out while the socket reconnects", async () => {
		const reconnecting = Promise.withResolvers<void>();
		mocks.reconnect.mockReturnValue(reconnecting.promise);
		const taking = hold.holdInHonduras({ home: mocks.HOME });
		await vi.waitFor(() => expect(mocks.reconnect).toHaveBeenCalled());

		await signOutHook()();
		reconnecting.resolve();

		await expect(taking).resolves.toBeNull();
		expect(mocks.journal.slice(-2)).toEqual(["move:home", "unmark"]);
	});

	it("returns no hold and frees the grid when the account changes while the socket reconnects", async () => {
		const reconnecting = Promise.withResolvers<void>();
		mocks.reconnect.mockReturnValue(reconnecting.promise);
		const taking = hold.holdInHonduras({ home: mocks.HOME });
		await vi.waitFor(() => expect(mocks.reconnect).toHaveBeenCalled());

		accounts.clearAccountCaches();
		reconnecting.resolve();

		await expect(taking).resolves.toBeNull();
		await hold.awaitHomeLocation();
		expect(mocks.journal).not.toContain("move:home");
	});

	it("waits for an earlier hold to move home before leaving again", async () => {
		const first = await takeHold();
		const homecoming = Promise.withResolvers<void>();
		mocks.updateLocation.mockImplementationOnce(() => homecoming.promise);
		void first.lease().release();

		const second = hold.holdInHonduras({ home: mocks.HOME });
		await settle();
		expect(mocks.writeAppDataFileAtomic).toHaveBeenCalledOnce();

		homecoming.resolve();
		const taken = await second;
		expect(mocks.writeAppDataFileAtomic).toHaveBeenCalledTimes(2);
		await taken?.lease().release();
	});

	it("moves home as soon as the phone app goes to the background", async () => {
		mocks.isMobilePlatform.mockReturnValue(true);
		const taken = await takeHold();
		const lease = taken.lease();

		setVisibility("hidden");
		await taken.ended;
		await hold.awaitHomeLocation();

		expect(mocks.journal.slice(-2)).toEqual(["move:home", "unmark"]);
		await lease.release();
		expect(movesHome()).toBe(1);
	});

	it("keeps the hold while a desktop window is hidden", async () => {
		const taken = await takeHold();
		const lease = taken.lease();

		setVisibility("hidden");
		await settle();

		expect(mocks.journal).not.toContain("move:home");
		await lease.release();
	});

	it("never moves home through the next account's session", async () => {
		const taken = await takeHold();
		const lease = taken.lease();

		accounts.clearAccountCaches();
		await lease.release();

		expect(mocks.journal).not.toContain("move:home");
	});
});

describe("signing out", () => {
	it("abandons a handover in flight quietly and moves home first", async () => {
		const refresh = Promise.withResolvers<unknown>();
		mocks.callMethod.mockReturnValue(refresh.promise);
		const taking = hold.holdInHonduras({ home: mocks.HOME });
		await vi.waitFor(() => expect(mocks.callMethod).toHaveBeenCalled());

		await signOutHook()();

		await expect(taking).resolves.toBeNull();
		expect(mocks.journal).toEqual([
			"mark",
			"move:hn",
			"move:home",
			"unmark",
		]);
	});

	it("retries a move home that failed earlier while still signed in", async () => {
		vi.useFakeTimers();
		const taken = await takeHold();
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));
		await taken.lease().release();
		expect(mocks.files.has(MARKER)).toBe(true);

		await signOutHook()();

		expect(movesHome()).toBe(2);
		expect(mocks.journal.at(-1)).toBe("unmark");
	});

	it("forgets the marker even when the move home keeps failing", async () => {
		vi.useFakeTimers();
		const taken = await takeHold();
		mocks.updateLocation.mockRejectedValue(new Error("offline"));
		await taken.lease().release();

		await signOutHook()();

		expect(movesHome()).toBe(2);
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("lets sign-out go on after 5 s when the move home hangs", async () => {
		vi.useFakeTimers();
		await takeHold();
		mocks.updateLocation.mockReturnValue(new Promise(() => {}));
		let signedOut = false;
		void signOutHook()().then(() => {
			signedOut = true;
		});

		await vi.advanceTimersByTimeAsync(4_999);
		expect(signedOut).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect(signedOut).toBe(true);
		expect(mocks.files.has(MARKER)).toBe(false);
	});
});

describe("atHomeLocation", () => {
	it("holds a grid request until the profile is back home", async () => {
		const taken = await takeHold();
		const lease = taken.lease();
		const request = vi.fn(() => {
			mocks.journal.push("grid");
			return Promise.resolve("cascade");
		});

		const pending = hold.atHomeLocation(request);
		await settle();
		expect(request).not.toHaveBeenCalled();

		await lease.release();
		await expect(pending).resolves.toBe("cascade");
		expect(mocks.journal.slice(-3)).toEqual([
			"move:home",
			"unmark",
			"grid",
		]);
	});

	it("waits for a grid request already in flight before leaving home", async () => {
		const cascade = Promise.withResolvers<string>();
		const inFlight = hold.atHomeLocation(() => cascade.promise);
		await settle();

		const taking = hold.holdInHonduras({ home: mocks.HOME });
		await settle();
		expect(mocks.writeAppDataFileAtomic).not.toHaveBeenCalled();

		cascade.resolve("cascade");
		await inFlight;
		const taken = await taking;
		expect(mocks.journal).toEqual([
			"mark",
			"move:hn",
			"refresh",
			"reconnect",
		]);
		await taken?.lease().release();
	});

	it("keeps waiting when a newer hold starts while the grid waits", async () => {
		const first = await takeHold();
		const request = vi.fn(() => Promise.resolve());
		const pending = hold.atHomeLocation(request);
		const homecoming = Promise.withResolvers<void>();
		mocks.updateLocation.mockImplementationOnce(() => homecoming.promise);
		void first.lease().release();

		const second = hold.holdInHonduras({ home: mocks.HOME });
		homecoming.resolve();
		const taken = await second;
		await settle();
		expect(request).not.toHaveBeenCalled();

		await taken?.lease().release();
		await pending;
		expect(request).toHaveBeenCalledOnce();
	});

	it("stops holding the grid once a hung move home outlasts the wait", async () => {
		vi.useFakeTimers();
		const taken = await takeHold();
		mocks.updateLocation.mockReturnValue(new Promise(() => {}));
		void taken.lease().release();
		const request = vi.fn(() => Promise.resolve());

		const pending = hold.atHomeLocation(request);
		await vi.advanceTimersByTimeAsync(SETTLE_WAIT_MS - 1);
		expect(request).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await pending;

		expect(request).toHaveBeenCalledOnce();
	});
});

describe("restoreStrandedLocation", () => {
	it("does nothing when no hold was left behind", async () => {
		await hold.restoreStrandedLocation();

		expect(mocks.updateLocation).not.toHaveBeenCalled();
	});

	it("moves a profile left in Honduras back home and forgets the marker", async () => {
		mocks.files.add(MARKER);

		await hold.restoreStrandedLocation();

		expect(mocks.updateLocation).toHaveBeenCalledExactlyOnceWith({
			geohash: mocks.HOME,
		});
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("keeps the marker when the move home fails", async () => {
		vi.useFakeTimers();
		mocks.files.add(MARKER);
		mocks.updateLocation.mockRejectedValue(new Error("offline"));

		await expect(hold.restoreStrandedLocation()).rejects.toThrow("offline");

		expect(mocks.files.has(MARKER)).toBe(true);
	});

	it("tries again a minute after the move home fails", async () => {
		vi.useFakeTimers();
		mocks.files.add(MARKER);
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));
		await hold.restoreStrandedLocation().catch(() => undefined);

		await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
		expect(movesHome()).toBe(1);
		await vi.advanceTimersByTimeAsync(1);

		expect(movesHome()).toBe(2);
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("tries again after a hold fails to move home", async () => {
		vi.useFakeTimers();
		const taken = await takeHold();
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));
		await taken.lease().release();

		await vi.advanceTimersByTimeAsync(RETRY_MS);

		expect(movesHome()).toBe(2);
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("stops trying once the account changed", async () => {
		vi.useFakeTimers();
		mocks.files.add(MARKER);
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));
		await hold.restoreStrandedLocation().catch(() => undefined);

		accounts.clearAccountCaches();
		await vi.advanceTimersByTimeAsync(RETRY_MS);

		expect(movesHome()).toBe(1);
	});

	it("skips a queued repair once the account changed", async () => {
		vi.useFakeTimers();
		const homecoming = Promise.withResolvers<void>();
		const taken = await takeHold();
		mocks.updateLocation.mockImplementationOnce(() => homecoming.promise);
		void taken.lease().release();
		const repair = hold.restoreStrandedLocation();
		await vi.advanceTimersByTimeAsync(0);
		expect(movesHome()).toBe(1);

		accounts.clearAccountCaches();
		homecoming.reject(new Error("offline"));
		await repair;

		expect(movesHome()).toBe(1);
		expect(mocks.files.has(MARKER)).toBe(true);
	});

	it("forgets the marker when there is no home to return to", async () => {
		mocks.files.add(MARKER);
		mocks.getPreferences.mockResolvedValue({ geohash: null });

		await hold.restoreStrandedLocation();

		expect(mocks.updateLocation).not.toHaveBeenCalled();
		expect(mocks.files.has(MARKER)).toBe(false);
	});

	it("leaves the marker of a live hold alone", async () => {
		const taken = await takeHold();
		const lease = taken.lease();

		await hold.restoreStrandedLocation();

		expect(mocks.journal).not.toContain("move:home");
		expect(mocks.files.has(MARKER)).toBe(true);
		await lease.release();
	});

	it("leaves later holds working after it fails", async () => {
		vi.useFakeTimers();
		mocks.files.add(MARKER);
		mocks.updateLocation.mockRejectedValueOnce(new Error("offline"));
		await hold.restoreStrandedLocation().catch(() => undefined);

		const taken = await takeHold();

		expect(mocks.journal.slice(-4)).toEqual([
			"mark",
			"move:hn",
			"refresh",
			"reconnect",
		]);
		await taken.lease().release();
	});
});
