import { getPushSettings, setPushSettings } from "$lib/api/settings/account";
import {
	openPushCategorySettings,
	pushAvailableHere,
	pushCategories,
	setPushCategory,
} from "./index";
import type { PushCategory, PushCategoryName } from "./types";

export const notificationCategories = $state<{ list: PushCategory[] }>({
	list: [],
});

export async function loadNotificationCategories(): Promise<void> {
	if (!pushAvailableHere()) return;
	const [device, account] = await Promise.all([
		pushCategories().catch(() => []),
		getPushSettings().catch(() => null),
	]);
	const taps = device.find((entry) => entry.category === "taps");
	const wanted = account?.tapPushNotification;
	if (taps && typeof wanted === "boolean" && taps.enabled !== wanted) {
		await setPushCategory("taps", wanted).catch(() => {});
		taps.enabled = wanted;
	}
	notificationCategories.list = device;
}

export async function toggleNotificationCategory(
	category: PushCategoryName,
	enabled: boolean,
): Promise<void> {
	await setPushCategory(category, enabled);
	if (category === "taps")
		await setPushSettings({ tapPushNotification: enabled });
	await loadNotificationCategories();
}

export async function showCategoryInSystemSettings(
	category: PushCategoryName,
): Promise<void> {
	await openPushCategorySettings(category);
}
