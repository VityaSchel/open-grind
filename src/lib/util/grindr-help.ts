import { systemLanguage } from "$lib/util/language";

function helpCenterUrl(path: string): string {
	return `https://help.grindr.com/hc/${systemLanguage()}/${path}`;
}

export const BAN_APPEAL_URL = "https://web.grindr.com/ban-appeal";

export function inPersonIncidentFormUrl(): string {
	return helpCenterUrl("requests/new?ticket_form_id=16925729533971");
}

export function bannedProfilesArticleUrl(): string {
	return helpCenterUrl("articles/1500009296922-Banned-profiles");
}

export function ageVerificationArticleUrl(): string {
	return helpCenterUrl("articles/4417616146963");
}
