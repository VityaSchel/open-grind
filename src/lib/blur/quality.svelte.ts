import {
	getPreferencesSnapshot,
	preferencesLoaded,
} from "$lib/app-data/preferences.svelte";
import {
	backdropBlurTrialArm,
	syncBackdropBlurTrial,
} from "./calibration/trial.svelte";
import { backdropCompositingRenders } from "./compositing.svelte";
import {
	BACKDROP_BLUR_MIRROR_KEY,
	BACKDROP_BLUR_ROOT_ATTRIBUTE,
	type BackdropBlurQuality,
	backdropFilterSupported,
	configuredBackdropBlurQuality,
	UNCALIBRATED_BACKDROP_BLUR_QUALITY,
} from "./quality";

export function backdropBlurRenderable(): boolean {
	return backdropFilterSupported() && backdropCompositingRenders();
}

function chosenBackdropBlurQuality(): BackdropBlurQuality | null {
	const preferences = getPreferencesSnapshot();
	return (
		preferences.backdropBlurQuality ??
		preferences.backdropBlurCalibration?.quality ??
		configuredBackdropBlurQuality()
	);
}

export function backdropBlurTrialPending(): boolean {
	return backdropBlurRenderable() && chosenBackdropBlurQuality() === null;
}

export function settledBackdropBlurQuality(): BackdropBlurQuality {
	if (!backdropBlurRenderable()) return "off";
	return chosenBackdropBlurQuality() ?? UNCALIBRATED_BACKDROP_BLUR_QUALITY;
}

export function effectiveBackdropBlurQuality(): BackdropBlurQuality {
	if (!backdropBlurRenderable()) return "off";
	return (
		chosenBackdropBlurQuality() ??
		backdropBlurTrialArm() ??
		UNCALIBRATED_BACKDROP_BLUR_QUALITY
	);
}

function rememberForNextLaunch(quality: BackdropBlurQuality): void {
	try {
		localStorage.setItem(BACKDROP_BLUR_MIRROR_KEY, quality);
	} catch {
		return;
	}
}

export function applyBackdropBlurQuality(): void {
	if (!preferencesLoaded()) return;
	syncBackdropBlurTrial({ needed: backdropBlurTrialPending() });
	const quality = effectiveBackdropBlurQuality();
	const root = document.documentElement;
	if (root.getAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE) !== quality) {
		root.setAttribute(BACKDROP_BLUR_ROOT_ATTRIBUTE, quality);
	}
	rememberForNextLaunch(settledBackdropBlurQuality());
}
