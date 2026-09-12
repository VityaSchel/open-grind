// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
}));

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
	MEDIUM_MIN_PAIRS,
	MIN_GESTURE_FRAMES,
	MIN_GESTURE_TRAVEL_PX,
	REFERENCE_PERIOD_MS,
	SETTLE_FRAMES,
} from "./constants";
import { backdropBlurTrialArm, syncBackdropBlurTrial } from "./trial.svelte";

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

beforeEach(async () => {
	vi.restoreAllMocks();
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
				samples: Array.from({ length: MEDIUM_MIN_PAIRS }, () => [
					20,
					REFERENCE_PERIOD_MS,
				]),
			},
		});
		syncBackdropBlurTrial({ needed: true });
		expect(backdropBlurTrialArm()).toBe("medium");
	});
});
