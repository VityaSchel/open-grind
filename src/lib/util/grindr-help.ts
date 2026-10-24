import { systemLanguage } from "$lib/util/language";

const helpCenterPaths = {
	inPersonIncidentForm: "requests/new?ticket_form_id=16925729533971",
	bannedProfiles: "articles/1500009296922-Banned-profiles",
	ageVerification: "articles/4417616146963",
} as const;

export const BAN_APPEAL_URL = "https://web.grindr.com/ban-appeal";

export function grindrHelpUrl(page: keyof typeof helpCenterPaths): string {
	return `https://help.grindr.com/hc/${systemLanguage()}/${helpCenterPaths[page]}`;
}
