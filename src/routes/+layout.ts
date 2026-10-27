import { redirect } from "@sveltejs/kit";

import { getPreferences } from "$lib/app-data/preferences.svelte";
import { demoEnabled } from "$lib/demo";
import { hydrateDesktopEntryState } from "$lib/platform/desktop-entry.svelte";
import { hydrateUpdateCapability } from "$lib/updates/capability.svelte";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

function onboardingAvailableHere(): boolean {
	return !demoEnabled;
}

export const load: LayoutLoad = async ({ url }) => {
	await hydrateUpdateCapability();
	await hydrateDesktopEntryState();
	const onboardingComplete =
		!onboardingAvailableHere() ||
		(await getPreferences()
			.then((preferences) => preferences.onboardingComplete)
			.catch(() => true));

	if (!onboardingComplete && url.pathname !== "/onboarding") {
		redirect(303, "/onboarding");
	}
	if (onboardingComplete && url.pathname === "/onboarding") {
		redirect(303, "/");
	}
};
