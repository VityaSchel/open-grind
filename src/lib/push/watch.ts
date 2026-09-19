import { goto } from "$app/navigation";

import { registerPushToken } from "$lib/api/settings/account";
import { onSignOut } from "$lib/api/sign-out";
import { routeForDeeplink } from "./deeplink";
import {
	currentMode,
	mintPushToken,
	pushAvailableHere,
	pushErrorReason,
	setMode,
	takePushDeeplink,
	watchPush,
} from "./index";
import { forgetPushRegistration } from "./teardown";

export async function startPushWatch(): Promise<void> {
	if (!pushAvailableHere()) return;
	onSignOut(forgetPushRegistration);
	await watchPush(({ deeplinkPending, tokenChanged }) => {
		if (deeplinkPending) void openPendingDeeplink();
		if (tokenChanged) void syncPushToken();
	});
	await openPendingDeeplink();
	await syncPushToken();
}

async function openPendingDeeplink(): Promise<void> {
	const deeplink = await takePushDeeplink().catch(() => null);
	const route = deeplink === null ? null : routeForDeeplink(deeplink);
	if (route) await goto(route);
}

async function syncPushToken(): Promise<void> {
	if ((await currentMode().catch(() => "slow")) !== "fast") return;
	try {
		await registerPushToken(await mintPushToken());
	} catch (error) {
		console.error("Failed to register the push token", error);
		if (addonIsGone(error)) await setMode("slow");
	}
}

function addonIsGone(error: unknown): boolean {
	const reason = pushErrorReason(error);
	return (
		reason === "addonUnavailable" ||
		reason === "addonUntrusted" ||
		reason === "addonDisabled" ||
		reason === "addonRefused"
	);
}
