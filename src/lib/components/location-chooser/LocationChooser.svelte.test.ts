// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { latLng, Map, Marker } from "leaflet";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeGeohash } from "$lib/model/geohash";
import { PIN_ZOOM } from "./constants";
import { stubMapResizeObserver } from "./map-test-helpers";

const {
	abortMock,
	preferencesSnapshotMock,
	reportFailureMock,
	runMock,
	setPreferencesMock,
	suspendMock,
	resumeMock,
	refreshStaleFixMock,
} = vi.hoisted(() => ({
	abortMock: vi.fn(),
	preferencesSnapshotMock: vi.fn(),
	reportFailureMock: vi.fn(),
	runMock: vi.fn(),
	setPreferencesMock: vi.fn(),
	suspendMock: vi.fn(),
	resumeMock: vi.fn(),
	refreshStaleFixMock: vi.fn(),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: preferencesSnapshotMock,
	preferencesLoaded: () => true,
	setPreferences: setPreferencesMock,
}));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: {
		suspend: suspendMock,
		resume: resumeMock,
		refreshStaleFix: refreshStaleFixMock,
	},
}));
vi.mock("$lib/location/location-feedback", () => ({
	reportLocationFailure: reportFailureMock,
}));
vi.mock("$lib/location/location-request.svelte", () => ({
	locationRequest: {
		run: runMock,
		abort: abortMock,
		get pending() {
			return pending;
		},
		get lastFix() {
			return lastFix;
		},
	},
}));

let pending = $state(false);
let lastFix = $state<{
	lat: number;
	lon: number;
	accuracyMeters: number;
} | null>(null);

function reportFix(fix: { lat: number; lon: number; accuracyMeters: number }) {
	lastFix = fix;
	return { status: "ok" as const, coords: fix };
}
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: () => true }));
vi.mock("$lib/util/breakpoints.svelte", () => ({
	above: () => ({ current: true }),
}));

const LocationChooser = (await import("./LocationChooser.svelte")).default;

await import("./GeoMap.svelte");

const BERLIN = { lat: 52.52, lon: 13.405 };
const PARIS = { lat: 48.8566, lon: 2.3522 };

function open(props: Record<string, unknown> = {}) {
	const onSubmit = vi.fn();
	render(LocationChooser, {
		props: { onSubmit, open: true, pinPos: PARIS, ...props },
	});
	return onSubmit;
}

const gpsSwitch = () => screen.getByRole("switch");
const switchState = () => gpsSwitch().getAttribute("data-state");
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("LocationChooser", () => {
	beforeEach(() => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: false,
			geohash: null,
		});
		pending = false;
		lastFix = null;
		runMock.mockImplementation(() =>
			Promise.resolve(reportFix({ ...BERLIN, accuracyMeters: 12 })),
		);
		setPreferencesMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		vi.resetAllMocks();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("saves the map center after panning, with a fixed marker", async () => {
		const setView = vi.spyOn(Map.prototype, "setView");
		const onSubmit = open();
		await screen.findByRole("button", { name: "Locate me" });
		const map = setView.mock.instances[0];
		if (!(map instanceof Map)) throw new Error("Map was not mounted");
		expect(map.getCenter()).toEqual(latLng(PARIS.lat, PARIS.lon));
		expect(map.getZoom()).toBe(PIN_ZOOM);
		flushSync(() => map.panBy([100, 80], { animate: false }));
		const center = map.getCenter().wrap();
		const selected = { lat: center.lat, lon: center.lng };
		expect(encodeGeohash(selected)).not.toBe(encodeGeohash(PARIS));
		const markers: Marker[] = [];
		map.eachLayer((layer) => {
			if (layer instanceof Marker) markers.push(layer);
		});
		expect(markers).toHaveLength(1);
		expect(markers[0]?.getLatLng().lat).toBeCloseTo(
			map.getCenter().lat,
			10,
		);
		expect(markers[0]?.getLatLng().lng).toBeCloseTo(
			map.getCenter().lng,
			10,
		);
		expect(markers[0]?.dragging?.enabled()).toBe(false);

		await fireEvent.click(saveButton());
		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(selected),
			autoUpdateLocation: false,
		});
	});

	it("keeps the pin visible after GPS recenters from another world copy", async () => {
		const setView = vi.spyOn(Map.prototype, "setView");
		const onSubmit = open();
		let finish!: (outcome: unknown) => void;
		runMock.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		await screen.findByRole("button", { name: "Locate me" });
		const map = setView.mock.instances[0];
		if (!(map instanceof Map)) throw new Error("Map was not mounted");
		flushSync(() => {
			map.setView([52, 373], 12, { animate: false });
			map.fire("drag");
		});
		const worldMarkers: Marker[] = [];
		map.eachLayer((layer) => {
			if (layer instanceof Marker) worldMarkers.push(layer);
		});
		expect(worldMarkers[0]?.getLatLng()).toEqual(latLng(52, 373));

		await fireEvent.click(gpsSwitch());
		expect(map.getCenter().lng).toBeCloseTo(373);
		flushSync(() =>
			finish(reportFix({ lat: 52, lon: 13, accuracyMeters: 12 })),
		);
		await vi.waitFor(() => expect(map.getCenter().lng).toBeCloseTo(13));
		await fireEvent.click(gpsSwitch());
		const markers: Marker[] = [];
		map.eachLayer((layer) => {
			if (layer instanceof Marker) markers.push(layer);
		});
		expect(markers).toHaveLength(1);
		expect(markers[0]?.getLatLng()).toEqual(latLng(52, 13));
		expect(markers[0]?.dragging?.enabled()).toBe(false);

		await fireEvent.click(saveButton());
		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash({ lat: 52, lon: 13 }),
			autoUpdateLocation: false,
		});
	});

	it("does not select a location when resizing emits a map move", async () => {
		const resize = stubMapResizeObserver();
		const setView = vi.spyOn(Map.prototype, "setView");
		const invalidateSize = vi
			.spyOn(Map.prototype, "invalidateSize")
			.mockImplementation(function (this: Map) {
				return this.fire("move");
			});
		const onSubmit = open({ pinPos: undefined });
		await screen.findByRole("button", { name: "Locate me" });
		const map = setView.mock.instances[0];
		if (!(map instanceof Map)) throw new Error("Map was not mounted");
		flushSync(() => resize());
		expect(invalidateSize).toHaveBeenCalledWith();
		expect(saveButton().hasAttribute("disabled")).toBe(true);
		const markers: Marker[] = [];
		map.eachLayer((layer) => {
			if (layer instanceof Marker) markers.push(layer);
		});
		expect(markers).toHaveLength(0);
		await fireEvent.click(saveButton());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("asks for a fresh fix the moment it opens", () => {
		render(LocationChooser, { props: { onSubmit: vi.fn(), open: true } });
		expect(refreshStaleFixMock).toHaveBeenCalledTimes(1);
	});

	it("hands GPS ownership to the chooser for as long as it is open", () => {
		const { unmount } = render(LocationChooser, {
			props: { onSubmit: vi.fn(), open: true },
		});
		expect(suspendMock).toHaveBeenCalledTimes(1);
		expect(resumeMock).not.toHaveBeenCalled();

		unmount();
		expect(resumeMock).toHaveBeenCalledTimes(1);
		expect(abortMock).toHaveBeenCalled();
	});

	it("never writes preferences from the toggle alone", async () => {
		open();
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());

		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(switchState()).toBe("checked");
	});

	it("commits the toggle together with the pin on Save", async () => {
		const onSubmit = open();
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());

		await fireEvent.click(saveButton());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(BERLIN),
			autoUpdateLocation: true,
		});
	});

	it("reverts to the stored setting when dismissed without saving", async () => {
		const { unmount } = render(LocationChooser, {
			props: { onSubmit: vi.fn(), open: true, pinPos: PARIS },
		});
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());
		expect(switchState()).toBe("checked");

		unmount();
		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(abortMock).toHaveBeenCalled();
	});

	it("moves the pin onto the retrieved position", async () => {
		const onSubmit = open();
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());

		await fireEvent.click(saveButton());
		expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ geohash: encodeGeohash(BERLIN) }),
		);
	});

	it("Save still works while the fix is still in flight", async () => {
		const onSubmit = open();
		runMock.mockReturnValue(new Promise(() => undefined));

		await fireEvent.click(gpsSwitch());
		await fireEvent.click(saveButton());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(PARIS),
			autoUpdateLocation: true,
		});
	});

	it("aborts the in-flight fix when the toggle goes back off", async () => {
		open();
		runMock.mockReturnValue(new Promise(() => undefined));

		await fireEvent.click(gpsSwitch());
		abortMock.mockClear();
		await fireEvent.click(gpsSwitch());

		expect(abortMock).toHaveBeenCalledTimes(1);
		expect(switchState()).toBe("unchecked");
	});

	it("a fix that lands after the toggle went off cannot move the pin", async () => {
		const onSubmit = open();
		let land!: (value: unknown) => void;
		runMock.mockReturnValue(
			new Promise<unknown>((resolve) => {
				land = resolve;
			}),
		);

		await fireEvent.click(gpsSwitch());
		await fireEvent.click(gpsSwitch());
		land({ status: "aborted" });
		await Promise.resolve();

		await fireEvent.click(saveButton());
		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(PARIS),
			autoUpdateLocation: false,
		});
	});

	it("switches itself back off and explains when permission is refused", async () => {
		open();
		runMock.mockResolvedValue({ status: "denied" });

		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(switchState()).toBe("unchecked"));
		expect(reportFailureMock).toHaveBeenCalledExactlyOnceWith({
			status: "denied",
		});
		expect(setPreferencesMock).not.toHaveBeenCalled();
	});

	it("reverts and reports when retrieval fails, so a broken GPS is never saved as on", async () => {
		open();
		runMock.mockResolvedValue({ status: "error", error: "unavailable" });

		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() =>
			expect(reportFailureMock).toHaveBeenCalledWith({
				status: "error",
				error: "unavailable",
			}),
		);
		expect(switchState()).toBe("unchecked");
	});

	it("forgets a dismissed toggle on reopen", async () => {
		const { rerender } = render(LocationChooser, {
			props: { onSubmit: vi.fn(), open: true, pinPos: PARIS },
		});
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());
		expect(switchState()).toBe("checked");

		await rerender({ open: false });
		await rerender({ open: true });
		expect(switchState()).toBe("unchecked");
	});

	it("starts from the stored setting", () => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: true,
			geohash: null,
		});
		open();
		expect(switchState()).toBe("checked");
	});

	it("commits turning tracking off", async () => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: true,
			geohash: null,
		});
		const onSubmit = open();

		await fireEvent.click(gpsSwitch());
		await fireEvent.click(saveButton());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(PARIS),
			autoUpdateLocation: false,
		});
	});
});

describe("LocationChooser GPS feedback", () => {
	beforeEach(() => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: true,
			geohash: null,
		});
		pending = false;
		lastFix = null;
		setPreferencesMock.mockResolvedValue(undefined);
		runMock.mockResolvedValue({ status: "aborted" });
	});

	afterEach(() => {
		cleanup();
		vi.resetAllMocks();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("follows a fix resolved by a grid refresh while open", async () => {
		const onSubmit = open();

		lastFix = { ...BERLIN, accuracyMeters: 30 };
		await vi.waitFor(() => {
			expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
		});
		await fireEvent.click(saveButton());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(BERLIN),
			autoUpdateLocation: true,
		});
	});

	it("ignores grid-resolved fixes while the pin is manual", async () => {
		preferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: false,
			geohash: null,
		});
		const onSubmit = open();

		lastFix = { ...BERLIN, accuracyMeters: 30 };
		await fireEvent.click(saveButton());

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
			geohash: encodeGeohash(PARIS),
			autoUpdateLocation: false,
		});
	});
});
