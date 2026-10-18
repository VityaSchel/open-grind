// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
}));

const ENGINE = "2.52.6";

const { linuxMock } = vi.hoisted(() => ({ linuxMock: vi.fn(() => false) }));

vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	isLinuxPlatform: linuxMock,
}));

vi.mock("../compositing.svelte", () => ({ webviewEngine: () => ENGINE }));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));

import {
	hydratePreferences,
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import {
	ARM_TRAVEL_PX,
	DEMOTE_MIN_PAIRS,
	MIN_GESTURE_FRAMES,
	MIN_GESTURE_TRAVEL_PX,
	REFERENCE_PERIOD_MS,
	SETTLE_FRAMES,
	SMOOTH_MIN_PAIRS,
	STALLED_MIN_PAIRS,
} from "./constants";
import { backdropBlurTrialArm, syncBackdropBlurTrial } from "./trial.svelte";

const SMOOTH_FRAME_MS = 15;

let now = 0;
let frameCallback: FrameRequestCallback | null = null;
let scroller: HTMLElement;

function paintBand() {
	const band = document.createElement("div");
	band.className = "pblur";
	document.body.append(band);
	band.getBoundingClientRect = () =>
		({ left: 0, right: 400, top: 0, bottom: 64 }) as DOMRect;
	document.elementFromPoint = () => band;
	return band;
}

function touchInput() {
	document.dispatchEvent(
		new TouchEvent("touchstart", {
			touches: [{ clientX: 0, clientY: 0 } as unknown as Touch],
		}),
	);
	document.dispatchEvent(
		new TouchEvent("touchmove", {
			touches: [{ clientX: 0, clientY: 200 } as unknown as Touch],
		}),
	);
}

function scrollTo(top: number) {
	scroller.scrollTop = top;
	scroller.dispatchEvent(new Event("scroll", { bubbles: false }));
}

function runFrame() {
	const callback = frameCallback;
	if (callback === null) return false;
	frameCallback = null;
	callback(now);
	return true;
}

function armingScrolls() {
	touchInput();
	const start = scroller.scrollTop;
	scrollTo(start + 4);
	scrollTo(start + 12);
	scrollTo(start + 4 + 2 * ARM_TRAVEL_PX);
}

function scrollOneGesture(frameIntervalMs: number) {
	armingScrolls();
	const start = scroller.scrollTop;
	const frames = SETTLE_FRAMES + MIN_GESTURE_FRAMES + 2;
	const step = Math.ceil((MIN_GESTURE_TRAVEL_PX * 2) / frames);
	for (let frame = 0; frame < frames; frame += 1) {
		now += frameIntervalMs;
		scrollTo(start + step * (frame + 1));
		runFrame();
	}
	now += 500;
	runFrame();
}

function stallOneGesture() {
	armingScrolls();
	stallFrames();
}

function stallFrames() {
	const start = scroller.scrollTop;
	for (let frame = 1; frame <= SETTLE_FRAMES; frame += 1) {
		now += 2000;
		scrollTo(start + frame * MIN_GESTURE_TRAVEL_PX);
		runFrame();
	}
	now += 500;
	runFrame();
}

beforeEach(async () => {
	vi.restoreAllMocks();
	linuxMock.mockReturnValue(false);
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	document.body.replaceChildren();
	now = 0;
	frameCallback = null;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frameCallback = callback;
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {
		frameCallback = null;
	});
	scroller = document.createElement("div");
	scroller.getBoundingClientRect = () =>
		({ left: 0, right: 400, top: 0, bottom: 800 }) as DOMRect;
	document.body.append(scroller);
	paintBand();
	await hydratePreferences();
	syncBackdropBlurTrial({ needed: false });
	await setPreferences({ backdropBlurCalibration: null });
	syncBackdropBlurTrial({ needed: true });
});

describe("backdrop blur scroll trial", () => {
	it("ignores a programmatic scroll, so blur never swaps on a still screen", () => {
		scrollTo(400);
		scrollTo(800);
		scrollTo(1200);
		expect(backdropBlurTrialArm()).toBeNull();
	});

	it("ignores touch input that never travels far enough to arm", () => {
		touchInput();
		scrollTo(2);
		scrollTo(4);
		scrollTo(6);
		expect(backdropBlurTrialArm()).toBeNull();
	});

	it("arms on real scrolling and leads with the full-blur arm", () => {
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("max");
	});

	it("does not measure a gesture under an open modal", () => {
		const overlay = document.createElement("div");
		overlay.dataset.slot = "sheet-overlay";
		document.body.append(overlay);
		armingScrolls();
		expect(backdropBlurTrialArm()).toBeNull();
	});

	it("alternates arms and stores one sample per completed pair", async () => {
		scrollOneGesture(20);
		expect(backdropBlurTrialArm()).toBe("max");
		scrollOneGesture(20);
		expect(backdropBlurTrialArm()).toBe("medium");
		await vi.waitFor(() => {
			const stored = preferencesSnapshot().backdropBlurCalibration;
			expect(stored?.samples).toHaveLength(1);
			expect(stored?.quality).toBeNull();
		});
	});

	it("releases the arm and its listeners when no longer needed", () => {
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("max");
		syncBackdropBlurTrial({ needed: false });
		expect(backdropBlurTrialArm()).toBeNull();
		armingScrolls();
		expect(backdropBlurTrialArm()).toBeNull();
	});

	it("settles without another gesture when stored samples already decide", async () => {
		syncBackdropBlurTrial({ needed: false });
		await setPreferences({
			backdropBlurCalibration: {
				quality: null,
				rung: "medium",
				engine: ENGINE,
				samples: Array.from({ length: DEMOTE_MIN_PAIRS }, () => [
					20,
					REFERENCE_PERIOD_MS,
				]),
			},
		});
		syncBackdropBlurTrial({ needed: true });
		expect(backdropBlurTrialArm()).toBe("min");
	});

	it("steps down a rung from stored samples and trials medium against Low next", async () => {
		syncBackdropBlurTrial({ needed: false });
		await setPreferences({
			backdropBlurCalibration: {
				quality: null,
				rung: "max",
				engine: ENGINE,
				samples: Array.from({ length: DEMOTE_MIN_PAIRS }, () => [
					20,
					REFERENCE_PERIOD_MS,
				]),
			},
		});
		syncBackdropBlurTrial({ needed: true });
		expect(backdropBlurTrialArm()).toBeNull();
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("medium");
	});

	it("ignores samples measured under another WebView engine", async () => {
		syncBackdropBlurTrial({ needed: false });
		await setPreferences({
			backdropBlurCalibration: {
				quality: null,
				rung: "max",
				engine: "2.54.1",
				samples: Array.from({ length: DEMOTE_MIN_PAIRS }, () => [
					20,
					REFERENCE_PERIOD_MS,
				]),
			},
		});
		syncBackdropBlurTrial({ needed: true });
		expect(backdropBlurTrialArm()).toBeNull();
	});

	it("stores the engine it measured under with every sample", async () => {
		scrollOneGesture(20);
		scrollOneGesture(20);
		await vi.waitFor(() => {
			expect(preferencesSnapshot().backdropBlurCalibration?.engine).toBe(
				ENGINE,
			);
		});
	});

	it("counts a gesture that drew almost no frames as stalled, and steps down a rung at a time", async () => {
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("max");
		stallFrames();
		expect(backdropBlurTrialArm()).toBe("min");
		for (let gesture = 1; gesture < 2 * STALLED_MIN_PAIRS; gesture += 1)
			stallOneGesture();
		await vi.waitFor(() => {
			const stored = preferencesSnapshot().backdropBlurCalibration;
			expect(stored?.rung).toBe("medium");
			expect(stored?.samples).toHaveLength(0);
		});
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("medium");
		stallFrames();
		for (let gesture = 1; gesture < 2 * STALLED_MIN_PAIRS; gesture += 1)
			stallOneGesture();
		expect(backdropBlurTrialArm()).toBe("min");
		await vi.waitFor(() => {
			expect(preferencesSnapshot().backdropBlurCalibration?.quality).toBe(
				"min",
			);
		});
	});

	it("climbs from Low on Linux, where trialing Full first can freeze WebKitGTK", async () => {
		syncBackdropBlurTrial({ needed: false });
		linuxMock.mockReturnValue(true);
		syncBackdropBlurTrial({ needed: true });
		scrollOneGesture(SMOOTH_FRAME_MS);
		expect(backdropBlurTrialArm()).toBe("medium");
		scrollOneGesture(SMOOTH_FRAME_MS);
		expect(backdropBlurTrialArm()).toBe("min");
		for (let gesture = 2; gesture < 2 * SMOOTH_MIN_PAIRS; gesture += 1)
			scrollOneGesture(SMOOTH_FRAME_MS);
		await vi.waitFor(() => {
			expect(preferencesSnapshot().backdropBlurCalibration?.rung).toBe(
				"max",
			);
		});
		armingScrolls();
		expect(backdropBlurTrialArm()).toBe("max");
	});
});
