import { redirect } from "@sveltejs/kit";

import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { hydrateDesktopEntryState } from "#lib/platform/desktop-entry.svelte.ts";
import { hydrateUpdateCapability } from "#lib/updates/capability.svelte.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

function onboardingAvailableHere(): boolean {
	return !__DEMO__;
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
