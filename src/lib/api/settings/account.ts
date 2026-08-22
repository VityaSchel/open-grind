import { fetchRest } from "$lib/api/transport";
import {
	type AccountPreferences,
	type AccountPreferencesPatch,
	accountPreferencesSchema,
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
