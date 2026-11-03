import { redirect } from "@sveltejs/kit";

import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { screenshotScene } from "#lib/demo/screenshot-scene.ts";
import { hydrateDesktopEntryState } from "#lib/platform/desktop-entry.svelte.ts";
import { hydrateUpdateCapability } from "#lib/updates/capability.svelte.ts";
import { updatesAvailableHere } from "#lib/updates/index.ts";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	await hydrateUpdateCapability();
	await hydrateDesktopEntryState();
	const onboardingComplete = __SCREENSHOTS__
		? !screenshotScene.onboarding
		: !updatesAvailableHere() ||
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
