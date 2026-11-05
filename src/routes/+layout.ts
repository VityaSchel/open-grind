import { redirect } from "@sveltejs/kit";

import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { hydrateDesktopEntryState } from "#lib/platform/desktop-entry.svelte.ts";
import { hydrateDisguiseState } from "#lib/platform/disguise.svelte.ts";
import { hydrateUpdateCapability } from "#lib/updates/capability.svelte.ts";
import { updatesAvailableHere } from "#lib/updates/index.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	await hydrateUpdateCapability();
	await hydrateDesktopEntryState();
	await hydrateDisguiseState();
	const onboardingComplete =
		!updatesAvailableHere() ||
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
