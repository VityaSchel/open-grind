import type {
	AccountPreferences,
	AccountPreferencesPatch,
} from "$lib/model/settings/account";
import { demoMeProfileId } from "../config";

const preferences: AccountPreferences = {
	profileId: demoMeProfileId,
	locationSearchOptOut: false,
	incognito: false,
	hideViewedMe: false,
	approximateDistance: false,
	viewRightNowNsfw: false,
	showOnMap: true,
	mapLocationFuzzRadius: null,
};

export function demoAccountPreferences(): AccountPreferences {
	return { ...preferences };
}

export function demoSetAccountPreferences(
	patch: AccountPreferencesPatch,
): void {
	Object.assign(preferences, patch);
}
