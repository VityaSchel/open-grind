import { unregisterPushToken } from "$lib/api/settings/account";
import { currentMode, mintPushToken } from "./index";

export async function forgetPushRegistration(): Promise<void> {
	if ((await currentMode().catch(() => "slow")) !== "fast") return;
	const minted = await mintPushToken().catch(() => null);
	if (!minted) return;
	await unregisterPushToken(minted.token).catch((error: unknown) => {
		console.error("Failed to unregister the push token", error);
	});
}
