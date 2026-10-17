// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
}));

const { compositingMock, hydratedMock } = vi.hoisted(() => ({
	compositingMock: vi.fn(() => true),
	hydratedMock: vi.fn(() => true),
}));

const ENGINE = "2.52.6";

const { linuxMock } = vi.hoisted(() => ({ linuxMock: vi.fn(() => false) }));

vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	isLinuxPlatform: linuxMock,
}));

const { remeasureMock } = vi.hoisted(() => ({ remeasureMock: vi.fn() }));

vi.mock("$lib/util/screen-chrome.svelte", () => ({
	remeasureScreenChrome: remeasureMock,
}));

vi.mock("./compositing.svelte", () => ({
	backdropCompositingRenders: compositingMock,
	backdropCompositingHydrated: hydratedMock,
	hydrateBackdropCompositing: () => Promise.resolve(),
	webviewEngine: () => ENGINE,
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import { DEMOTE_MIN_PAIRS, REFERENCE_PERIOD_MS } from "./calibration/constants";
import {
	backdropBlurTrialArm,
	syncBackdropBlurTrial,
} from "./calibration/trial.svelte";
import {
	BACKDROP_BLUR_MIRROR_KEY,
	BACKDROP_BLUR_QUALITY_ORDER,
	BACKDROP_BLUR_ROOT_ATTRIBUTE,
	backdropFilterSupported,
	UNCALIBRATED_BACKDROP_BLUR_QUALITY,
} from "./quality";
import {
	applyBackdropBlurQuality,
	backdropBlurTrialPending,
	effectiveBackdropBlurQuality,
} from "./quality.svelte";

function withBackdropSupport(supported: boolean) {
	vi.spyOn(CSS, "supports").mockImplementation(() => supported);
}

beforeEach(async () => {
	vi.restoreAllMocks();
	readMock.mockReset().mockResolvedValue(encode({}));
	writeMock.mockReset().mockResolvedValue(undefined);
	compositingMock.mockReturnValue(true);
	hydratedMock.mockReturnValue(true);
	linuxMock.mockReturnValue(false);
	document.documentElement.removeAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE);
	syncBackdropBlurTrial({ needed: false });
	await setPreferences({
		backdropBlurQuality: null,
		backdropBlurCalibration: null,
	});
});

describe("effectiveBackdropBlurQuality", () => {
	it("renders today's blur until anything says otherwise", () => {
		withBackdropSupport(true);
		expect(effectiveBackdropBlurQuality()).toBe(
			UNCALIBRATED_BACKDROP_BLUR_QUALITY,
		);
		expect(UNCALIBRATED_BACKDROP_BLUR_QUALITY).toBe("max");
	});

	it("renders Low before calibrating on Linux, where Full can freeze WebKitGTK", () => {
		withBackdropSupport(true);
		linuxMock.mockReturnValue(true);
		expect(effectiveBackdropBlurQuality()).toBe("min");
	});

	it("falls to off when the engine cannot blur backdrops", async () => {
		withBackdropSupport(false);
		await setPreferences({ backdropBlurQuality: "max" });
		expect(effectiveBackdropBlurQuality()).toBe("off");
	});

	it("prefers the device calibration over the uncalibrated default", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurCalibration: {
				quality: "medium",
				rung: "max",
				engine: ENGINE,
				samples: [],
			},
		});
		expect(effectiveBackdropBlurQuality()).toBe("medium");
	});

	it("drops a calibration measured under another WebView engine", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurCalibration: {
				quality: "min",
				rung: "medium",
				engine: "2.50.4",
				samples: [],
			},
		});
		expect(effectiveBackdropBlurQuality()).toBe(
			UNCALIBRATED_BACKDROP_BLUR_QUALITY,
		);
		expect(backdropBlurTrialPending()).toBe(true);
	});

	it("falls to off when the compositor cannot execute the blur, whatever the engine claims", async () => {
		withBackdropSupport(true);
		compositingMock.mockReturnValue(false);
		await setPreferences({ backdropBlurQuality: "max" });
		expect(effectiveBackdropBlurQuality()).toBe("off");
	});

	it("runs no trial on a compositor that cannot execute the blur", () => {
		withBackdropSupport(true);
		compositingMock.mockReturnValue(false);
		expect(backdropBlurTrialPending()).toBe(false);
		compositingMock.mockReturnValue(true);
		expect(backdropBlurTrialPending()).toBe(true);
	});

	it("prefers an explicit choice over the device calibration", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurQuality: "min",
			backdropBlurCalibration: {
				quality: "medium",
				rung: "max",
				engine: ENGINE,
				samples: [],
			},
		});
		expect(effectiveBackdropBlurQuality()).toBe("min");
	});
});

describe("applyBackdropBlurQuality", () => {
	it("stamps the root attribute and the pre-paint mirror", async () => {
		withBackdropSupport(true);
		await setPreferences({ backdropBlurQuality: "off" });
		applyBackdropBlurQuality();
		expect(
			document.documentElement.getAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE),
		).toBe("off");
		expect(localStorage.getItem(BACKDROP_BLUR_MIRROR_KEY)).toBe("off");
	});

	it("remeasures the screen chrome only when the level changes", async () => {
		withBackdropSupport(true);
		await setPreferences({ backdropBlurQuality: "min" });
		remeasureMock.mockClear();
		applyBackdropBlurQuality();
		applyBackdropBlurQuality();
		expect(remeasureMock).toHaveBeenCalledTimes(1);
	});

	it("mirrors the settled level, never a trial arm", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurQuality: null,
			backdropBlurCalibration: {
				quality: null,
				rung: "max",
				engine: ENGINE,
				samples: [[20, 16.7]],
			},
		});
		applyBackdropBlurQuality();
		expect(localStorage.getItem(BACKDROP_BLUR_MIRROR_KEY)).toBe("max");
	});

	it("runs the trial only while nothing has chosen a level", async () => {
		withBackdropSupport(true);
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
		applyBackdropBlurQuality();
		expect(backdropBlurTrialArm()).toBe("min");
		await setPreferences({ backdropBlurQuality: "off" });
		applyBackdropBlurQuality();
		expect(backdropBlurTrialArm()).toBeNull();
		expect(
			document.documentElement.getAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE),
		).toBe("off");
	});

	it("leaves the mirror-stamped attribute alone until the engine has answered", async () => {
		withBackdropSupport(true);
		hydratedMock.mockReturnValue(false);
		document.documentElement.setAttribute(
			BACKDROP_BLUR_ROOT_ATTRIBUTE,
			"min",
		);
		await setPreferences({ backdropBlurQuality: "off" });
		applyBackdropBlurQuality();
		expect(
			document.documentElement.getAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE),
		).toBe("min");
	});

	it("leaves the mirror-stamped attribute alone until preferences hydrate", async () => {
		withBackdropSupport(true);
		readMock.mockReturnValue(new Promise(() => {}));
		vi.resetModules();
		const { applyBackdropBlurQuality: applyBeforeHydration } =
			await import("./quality.svelte");
		localStorage.setItem(BACKDROP_BLUR_MIRROR_KEY, "off");
		document.documentElement.setAttribute(
			BACKDROP_BLUR_ROOT_ATTRIBUTE,
			"off",
		);
		applyBeforeHydration();
		expect(
			document.documentElement.getAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE),
		).toBe("off");
		expect(localStorage.getItem(BACKDROP_BLUR_MIRROR_KEY)).toBe("off");
	});
});

describe("backdropFilterSupported", () => {
	it("accepts a prefix-only engine", () => {
		vi.spyOn(CSS, "supports").mockImplementation(
			(property: string) => property === "-webkit-backdrop-filter",
		);
		expect(backdropFilterSupported()).toBe(true);
	});
});

describe("BACKDROP_BLUR_QUALITY_ORDER", () => {
	it("runs weakest to strongest so slider travel means more blur", () => {
		expect([...BACKDROP_BLUR_QUALITY_ORDER]).toEqual([
			"off",
			"min",
			"medium",
			"max",
		]);
	});
});
