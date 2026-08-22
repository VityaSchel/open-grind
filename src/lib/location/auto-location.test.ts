// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeGeohash } from "$lib/model/geohash";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const {
	abortStaleMock,
	getPreferencesSnapshotMock,
	isMobilePlatformMock,
	permissionToastMock,
	reportFailureMock,
	runMock,
	setPreferencesMock,
	showErrorToastMock,
} = vi.hoisted(() => ({
	abortStaleMock: vi.fn(),
	getPreferencesSnapshotMock: vi.fn(),
	isMobilePlatformMock: vi.fn(),
	permissionToastMock: vi.fn(),
	reportFailureMock: vi.fn(),
	runMock: vi.fn(),
	setPreferencesMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

const locationRequestMock = vi.hoisted(() => ({
	run: runMock,
	abortStale: abortStaleMock,
	pending: false,
	lastFix: null,
	lastFixAt: null as number | null,
	generation: 7,
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferencesSnapshot: getPreferencesSnapshotMock,
	setPreferences: setPreferencesMock,
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: isMobilePlatformMock }));
vi.mock("./location-request.svelte", () => ({
	locationRequest: locationRequestMock,
}));
vi.mock("./location-feedback", () => ({
	reportLocationFailure: reportFailureMock,
	showLocationPermissionToast: permissionToastMock,
}));

const {
	autoLocation,
	BACKGROUND_FIX_MAX_AGE_MS,
	GPS_FIX_TIMEOUT_MS,
	INTERACTIVE_FIX_MAX_AGE_MS,
} = await import("./auto-location");

const BERLIN = { lat: 52.52, lon: 13.405 };
const CURRENT = encodeGeohash(BERLIN);

function metersNorth(meters: number) {
	return { lat: BERLIN.lat + meters / 111_320, lon: BERLIN.lon };
}

function ok(coords: { lat: number; lon: number }) {
	return { status: "ok" as const, coords: { ...coords, accuracyMeters: 5 } };
}

describe("autoLocation.resolveGeohash", () => {
	beforeEach(() => {
		setNowForTesting(() => 0);
		isMobilePlatformMock.mockReturnValue(true);
		getPreferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: true,
			geohash: CURRENT,
		});
		runMock.mockResolvedValue(ok(BERLIN));
		setPreferencesMock.mockResolvedValue(undefined);
		locationRequestMock.pending = false;
		locationRequestMock.lastFixAt = null;
	});

	afterEach(() => {
		autoLocation.resume();
		resetNowForTesting();
		vi.resetAllMocks();
	});

	// first in file order: the prompt budget is per session and never resets
	it("prompts the system only on the first resolution", async () => {
		await autoLocation.resolveGeohash(CURRENT);
		expect(runMock).toHaveBeenNthCalledWith(1, { prompt: true });

		await autoLocation.resolveGeohash(CURRENT);
		expect(runMock).toHaveBeenNthCalledWith(2, { prompt: false });
	});

	it("keeps the current geohash off mobile, without asking", async () => {
		isMobilePlatformMock.mockReturnValue(false);
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
		expect(runMock).not.toHaveBeenCalled();
	});

	it("keeps the current geohash while the setting is off", async () => {
		getPreferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: false,
			geohash: CURRENT,
		});
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
		expect(runMock).not.toHaveBeenCalled();
	});

	it("a background refresh reuses a fix for six minutes", async () => {
		locationRequestMock.lastFixAt = 0;
		setNowForTesting(() => BACKGROUND_FIX_MAX_AGE_MS - 1);
		await autoLocation.resolveGeohash(CURRENT, { background: true });
		expect(runMock).not.toHaveBeenCalled();

		setNowForTesting(() => BACKGROUND_FIX_MAX_AGE_MS);
		await autoLocation.resolveGeohash(CURRENT, { background: true });
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it("an interactive refresh reuses a fix for seconds only", async () => {
		locationRequestMock.lastFixAt = 0;
		setNowForTesting(() => INTERACTIVE_FIX_MAX_AGE_MS - 1);
		await autoLocation.resolveGeohash(CURRENT);
		expect(runMock).not.toHaveBeenCalled();

		setNowForTesting(() => INTERACTIVE_FIX_MAX_AGE_MS);
		await autoLocation.resolveGeohash(CURRENT);
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	describe("refreshStaleFix", () => {
		it("fetches for the map once the fix is seconds-stale", async () => {
			locationRequestMock.lastFixAt = 0;
			setNowForTesting(() => INTERACTIVE_FIX_MAX_AGE_MS - 1);
			await autoLocation.refreshStaleFix();
			expect(runMock).not.toHaveBeenCalled();

			setNowForTesting(() => INTERACTIVE_FIX_MAX_AGE_MS);
			await autoLocation.refreshStaleFix();
			expect(runMock).toHaveBeenCalledExactlyOnceWith({ prompt: false });
		});

		it("does nothing while the setting is off", async () => {
			getPreferencesSnapshotMock.mockReturnValue({
				autoUpdateLocation: false,
				geohash: CURRENT,
			});
			await autoLocation.refreshStaleFix();
			expect(runMock).not.toHaveBeenCalled();
		});

		it("reports a failed refresh instead of swallowing it", async () => {
			runMock.mockResolvedValue({
				status: "error",
				error: "Location disabled.",
			});
			await autoLocation.refreshStaleFix();
			expect(reportFailureMock).toHaveBeenCalledExactlyOnceWith({
				status: "error",
				error: "Location disabled.",
			});

			reportFailureMock.mockClear();
			runMock.mockResolvedValue(ok(BERLIN));
			await autoLocation.refreshStaleFix();
			expect(reportFailureMock).toHaveBeenCalledExactlyOnceWith(
				ok(BERLIN),
			);
		});

		it("gives up on a hung refresh without reporting", async () => {
			vi.useFakeTimers();
			try {
				runMock.mockReturnValue(new Promise(() => undefined));
				const refreshing = autoLocation.refreshStaleFix();
				await vi.advanceTimersByTimeAsync(GPS_FIX_TIMEOUT_MS);
				await refreshing;
				expect(abortStaleMock).toHaveBeenCalledExactlyOnceWith(7);
				expect(reportFailureMock).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	it("skips GPS while another retrieval is in flight", async () => {
		locationRequestMock.pending = true;
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
		expect(runMock).not.toHaveBeenCalled();
	});

	it("skips GPS while the app is backgrounded", async () => {
		const hidden = vi
			.spyOn(document, "hidden", "get")
			.mockReturnValue(true);
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
		expect(runMock).not.toHaveBeenCalled();
		hidden.mockRestore();
	});

	it("returns the moved geohash once the fix is 100m away", async () => {
		const moved = metersNorth(250);
		runMock.mockResolvedValue(ok(moved));
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			encodeGeohash(moved),
		);
	});

	it("keeps the current geohash while the fix stays within 100m", async () => {
		runMock.mockResolvedValue(ok(metersNorth(20)));
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
	});

	it("turns the setting off and explains when permission is refused", async () => {
		runMock.mockResolvedValue({ status: "denied" });
		await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
			CURRENT,
		);
		expect(permissionToastMock).toHaveBeenCalledTimes(1);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			autoUpdateLocation: false,
		});
	});

	it("reports a failure streak once, and again after a recovery", async () => {
		runMock.mockResolvedValue({ status: "error", error: "unavailable" });
		await autoLocation.resolveGeohash(CURRENT);
		await autoLocation.resolveGeohash(CURRENT);
		expect(showErrorToastMock).toHaveBeenCalledTimes(1);

		runMock.mockResolvedValue(ok(metersNorth(250)));
		await autoLocation.resolveGeohash(CURRENT);

		runMock.mockResolvedValue({ status: "error", error: "unavailable" });
		await autoLocation.resolveGeohash(CURRENT);
		expect(showErrorToastMock).toHaveBeenCalledTimes(2);
	});

	it("gives up on a hung fix instead of blocking the grid", async () => {
		vi.useFakeTimers();
		try {
			runMock.mockReturnValue(new Promise(() => undefined));
			const resolving = autoLocation.resolveGeohash(CURRENT);
			await vi.advanceTimersByTimeAsync(GPS_FIX_TIMEOUT_MS);
			await expect(resolving).resolves.toBe(CURRENT);
			expect(abortStaleMock).toHaveBeenCalledExactlyOnceWith(7);
		} finally {
			vi.useRealTimers();
		}
	});

	describe("while the chooser owns GPS", () => {
		it("still samples for the map but never moves the grid", async () => {
			const moved = metersNorth(250);
			runMock.mockResolvedValue(ok(moved));
			autoLocation.suspend();

			await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
				CURRENT,
			);
			expect(runMock).toHaveBeenCalledExactlyOnceWith({ prompt: false });
		});

		it("swallows a denial: the chooser handles its own", async () => {
			runMock.mockResolvedValue({ status: "denied" });
			autoLocation.suspend();

			await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
				CURRENT,
			);
			expect(permissionToastMock).not.toHaveBeenCalled();
			expect(setPreferencesMock).not.toHaveBeenCalled();
		});

		it("moves the grid again after resume", async () => {
			const moved = metersNorth(250);
			runMock.mockResolvedValue(ok(moved));
			autoLocation.suspend();
			autoLocation.resume();

			await expect(autoLocation.resolveGeohash(CURRENT)).resolves.toBe(
				encodeGeohash(moved),
			);
		});
	});
});
