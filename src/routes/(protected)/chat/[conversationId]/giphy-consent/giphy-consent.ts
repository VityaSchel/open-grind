import {
	preferencesLoaded,
	preferencesSnapshot,
} from "$lib/app-data/preferences.svelte";

export function giphyConsented(): boolean {
	return preferencesLoaded() && preferencesSnapshot().giphyConsent;
}
