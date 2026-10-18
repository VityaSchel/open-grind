import { showErrorToast } from "$lib/api/error-toast";
import {
	preferencesLoaded,
	preferencesSnapshot,
	setPreferences,
} from "$lib/app-data/preferences.svelte";

export function giphyConsented(): boolean {
	return preferencesLoaded() && preferencesSnapshot().giphyConsent;
}

export async function turnOnGiphy(): Promise<boolean> {
	try {
		await setPreferences({ giphyConsent: true });
		return true;
	} catch (error) {
		showErrorToast({ label: "Failed to save preferences", error });
		return false;
	}
}
