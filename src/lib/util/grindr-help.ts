import { systemLanguage } from "$lib/util/language";

function helpCenterUrl(path: string): string {
	return `https://help.grindr.com/hc/${systemLanguage()}/${path}`;
}

export function inPersonIncidentFormUrl(): string {
	return helpCenterUrl("requests/new?ticket_form_id=16925729533971");
}
