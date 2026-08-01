import { page } from "$app/state";

import { callMethod } from "$lib/api/methods";
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

	const profileId = await callMethod("auth_state").catch(() => null);
	if (profileId !== null) return;

	await signOut();
}
