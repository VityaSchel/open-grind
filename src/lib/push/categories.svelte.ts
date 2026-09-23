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

const ANDROID_OWNED: ReadonlySet<PushCategoryName> = new Set<PushCategoryName>([
	"messages",
]);

let sentToSettings: PushCategoryName | null = null;

export async function loadNotificationCategories(): Promise<void> {
	if (!pushAvailableHere()) return;
	const returningFrom = sentToSettings;
	sentToSettings = null;
	const [device, account] = await Promise.all([
		pushCategories().catch(() => null),
		getPushSettings().catch(() => null),
	]);
	if (!device) return;
	const taps = device.find((entry) => entry.category === "taps");
	const wanted = account?.tapPushNotification;
	if (taps && typeof wanted === "boolean" && taps.enabled !== wanted) {
		await setPushCategory({ category: "taps", enabled: wanted }).then(
			() => {
				taps.enabled = wanted;
			},
			() => {},
		);
	}
	notificationCategories.list = device;
	const allowed = device.find((entry) => entry.category === returningFrom);
	if (allowed && !allowed.systemBlocked && !allowed.enabled)
		await saveCategory({ category: allowed.category, enabled: true }).catch(
			() => {},
		);
}

export async function toggleNotificationCategory({
	category,
	enabled,
}: {
	category: PushCategoryName;
	enabled: boolean;
}): Promise<void> {
	const current = notificationCategories.list.find(
		(entry) => entry.category === category,
	);
	if (current?.systemBlocked) {
		if (!enabled) return;
		await openPushCategorySettings(category);
		sentToSettings = category;
		return;
	}
	if (ANDROID_OWNED.has(category)) {
		if (!enabled) await openPushCategorySettings(category);
		return;
	}
	await saveCategory({ category, enabled });
}

async function saveCategory({
	category,
	enabled,
}: {
	category: PushCategoryName;
	enabled: boolean;
}): Promise<void> {
	await setPushCategory({ category, enabled });
	if (category === "taps")
		await setPushSettings({ tapPushNotification: enabled });
	await loadNotificationCategories();
}
