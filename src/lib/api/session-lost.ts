import { page } from "$app/state";

import { signedInProfileId } from "$lib/api/current-session";
import { googleHandoffState } from "$lib/api/google-handoff-state.svelte";
import { signOut } from "$lib/api/sign-out";

let pending: Promise<void> | null = null;

export function signOutIfSessionLost(): Promise<void> {
	pending ??= confirmSessionLost().finally(() => {
		pending = null;
	});
	return pending;
}

async function confirmSessionLost(): Promise<void> {
	const insideTheApp = page.route.id?.startsWith("/(protected)") ?? false;
	if (!insideTheApp) return;
	if (googleHandoffState.phase === "switchingAccount") return;

	const profileId = await signedInProfileId().catch(() => null);
	if (profileId !== null) return;

	await signOut();
}
