import { fetchRest } from "$lib/api/transport";
import {
	type AccountPreferences,
	type AccountPreferencesPatch,
	accountPreferencesSchema,
	type PushSettings,
	pushSettingsSchema,
} from "$lib/model/settings/account";

export async function getAccountPreferences(): Promise<AccountPreferences> {
	return await fetchRest("/v3/me/prefs/settings").then((res) =>
		res.jsonParsed(accountPreferencesSchema),
	);
}

export async function setAccountPreferences(settings: AccountPreferencesPatch) {
	await fetchRest("/v3/me/prefs/settings", {
		method: "PUT",
		body: { settings },
	}).then((res) => res.assertOk());
}

export async function getPushSettings(): Promise<PushSettings> {
	return await fetchRest("/v5/push-settings").then((res) =>
		res.jsonParsed(pushSettingsSchema),
	);
}

export async function setPushSettings(settings: PushSettings) {
	await fetchRest("/v5/push-settings", {
		method: "PUT",
		body: settings,
	}).then((res) => res.assertOk());
}

export async function registerPushToken(registration: {
	vendorProvidedIdentifier: string;
	token: string;
}) {
	await fetchRest("/v3/gcm-push-tokens", {
		method: "POST",
		body: registration,
	}).then((res) => res.assertOk());
}

export async function unregisterPushToken(token: string) {
	await fetchRest(`/v3/push-tokens/${encodeURIComponent(token)}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}
