import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	preferencesLoaded,
	preferencesSnapshot,
	setPreferences,
} from "#lib/app-data/preferences.svelte.ts";
import { t } from "#lib/i18n/index.ts";

export function giphyConsented(): boolean {
	return preferencesLoaded() && preferencesSnapshot().giphyConsent;
}

export async function turnOnGiphy(): Promise<boolean> {
	try {
		await setPreferences({ giphyConsent: true });
		return true;
	} catch (error) {
		showErrorToast({
			label: t("chat.giphy.consent.errors.saveFailed"),
			error,
		});
		return false;
	}
}
