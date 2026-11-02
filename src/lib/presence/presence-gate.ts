import {
	preferencesLoaded,
	preferencesSnapshot,
} from "#lib/app-data/preferences.svelte.ts";
import { pushDeeplinkAhead } from "#lib/push/opening-deeplink.ts";

export function staysOnline(): boolean {
	return preferencesLoaded() && preferencesSnapshot().stayOnline;
}

export async function showsOnReturn({
	viewActive,
}: {
	viewActive: boolean;
}): Promise<boolean> {
	return viewActive && !(await pushDeeplinkAhead());
}
