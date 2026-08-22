import { redirect } from "@sveltejs/kit";

import { getPreferences } from "$lib/app-data/preferences.svelte";
import { updatesAvailableHere } from "$lib/updates";
import { hydrateUpdateCapability } from "$lib/updates/capability.svelte";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	await hydrateUpdateCapability();
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
