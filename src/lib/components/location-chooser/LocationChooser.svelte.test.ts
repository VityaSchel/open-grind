// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeGeohash } from "$lib/model/geohash";

const {
	abortMock,
	getPreferencesSnapshotMock,
	reportFailureMock,
	runMock,
	setPreferencesMock,
	suspendMock,
	resumeMock,
	refreshStaleFixMock,
} = vi.hoisted(() => ({
	abortMock: vi.fn(),
	getPreferencesSnapshotMock: vi.fn(),
	reportFailureMock: vi.fn(),
	runMock: vi.fn(),
	setPreferencesMock: vi.fn(),
	suspendMock: vi.fn(),
	resumeMock: vi.fn(),
	refreshStaleFixMock: vi.fn(),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferencesSnapshot: getPreferencesSnapshotMock,
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

const BERLIN = { lat: 52.52, lon: 13.405 };
const PARIS = { lat: 48.8566, lon: 2.3522 };

function open(props: Record<string, unknown> = {}) {
	const onSubmit = vi.fn();
	render(LocationChooser, {
		props: {
			onSubmit,
			open: true,
			pinPos: { ...PARIS, zoom: 12 },
			...props,
		},
	});
	return onSubmit;
}

const gpsSwitch = () => screen.getByRole("switch");
const switchState = () => gpsSwitch().getAttribute("data-state");
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("LocationChooser", () => {
	beforeEach(() => {
		getPreferencesSnapshotMock.mockReturnValue({
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
			props: {
				onSubmit: vi.fn(),
				open: true,
				pinPos: { ...PARIS, zoom: 12 },
			},
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
			props: {
				onSubmit: vi.fn(),
				open: true,
				pinPos: { ...PARIS, zoom: 12 },
			},
		});
		await fireEvent.click(gpsSwitch());
		await vi.waitFor(() => expect(runMock).toHaveBeenCalled());
		expect(switchState()).toBe("checked");

		await rerender({ open: false });
		await rerender({ open: true });
		expect(switchState()).toBe("unchecked");
	});

	it("starts from the stored setting", () => {
		getPreferencesSnapshotMock.mockReturnValue({
			autoUpdateLocation: true,
			geohash: null,
		});
		open();
		expect(switchState()).toBe("checked");
	});

	it("commits turning tracking off", async () => {
		getPreferencesSnapshotMock.mockReturnValue({
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
		getPreferencesSnapshotMock.mockReturnValue({
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
		getPreferencesSnapshotMock.mockReturnValue({
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
