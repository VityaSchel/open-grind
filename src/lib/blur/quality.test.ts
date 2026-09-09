// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock } = vi.hoisted(() => ({
	readMock: vi.fn(),
	writeMock: vi.fn(),
}));

const { compositingMock } = vi.hoisted(() => ({
	compositingMock: vi.fn(() => true),
}));

vi.mock("./compositing.svelte", () => ({
	backdropCompositingRenders: compositingMock,
	hydrateBackdropCompositing: () => Promise.resolve(),
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: readMock,
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));

import { setPreferences } from "$lib/app-data/preferences.svelte";
import { MEDIUM_MIN_PAIRS, REFERENCE_PERIOD_MS } from "./calibration/constants";
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

	it("falls to off when the engine cannot blur backdrops", async () => {
		withBackdropSupport(false);
		await setPreferences({ backdropBlurQuality: "max" });
		expect(effectiveBackdropBlurQuality()).toBe("off");
	});

	it("prefers the device calibration over the uncalibrated default", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurCalibration: { quality: "medium", samples: [] },
		});
		expect(effectiveBackdropBlurQuality()).toBe("medium");
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
			backdropBlurCalibration: { quality: "medium", samples: [] },
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

	it("mirrors the settled level, never a trial arm", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurQuality: null,
			backdropBlurCalibration: { quality: null, samples: [[20, 16.7]] },
		});
		applyBackdropBlurQuality();
		expect(localStorage.getItem(BACKDROP_BLUR_MIRROR_KEY)).toBe("max");
	});

	it("runs the trial only while nothing has chosen a level", async () => {
		withBackdropSupport(true);
		await setPreferences({
			backdropBlurCalibration: {
				quality: null,
				samples: Array.from({ length: MEDIUM_MIN_PAIRS }, () => [
					20,
					REFERENCE_PERIOD_MS,
				]),
			},
		});
		applyBackdropBlurQuality();
		expect(backdropBlurTrialArm()).toBe("medium");
		await setPreferences({ backdropBlurQuality: "min" });
		applyBackdropBlurQuality();
		expect(backdropBlurTrialArm()).toBeNull();
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
