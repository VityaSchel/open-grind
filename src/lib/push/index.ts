import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

import { asAppError } from "$lib/api/methods";
import { isAndroidPlatform } from "$lib/platform/os";
import {
	type NotificationMode,
	notificationModeSchema,
	type PushCategory,
	type PushCategoryName,
	pushCategorySchema,
	type PushErrorReason,
	pushErrorSchema,
	type PushSignal,
	pushSignalSchema,
	type PushToken,
	pushTokenSchema,
} from "./types";

export * from "./types";

export function pushAvailableHere(): boolean {
	return isTauri() && isAndroidPlatform();
}

export function pushErrorReason(error: unknown): PushErrorReason | null {
	const app = asAppError(error);
	if (app?.kind !== "Push") return null;
	return pushErrorSchema.safeParse(app.message).data?.reason ?? "failed";
}

export async function addonReady(): Promise<void> {
	await invoke("push_addon_ready");
}

export async function mintPushToken(): Promise<PushToken> {
	return pushTokenSchema.parse(await invoke("push_token"));
}

export async function deletePushToken(): Promise<void> {
	await invoke("push_delete_token");
}

export async function currentMode(): Promise<NotificationMode> {
	return notificationModeSchema.parse(await invoke("push_mode"));
}

export async function setMode(mode: NotificationMode): Promise<void> {
	await invoke("push_set_mode", { mode });
}

export async function pushCategories(): Promise<PushCategory[]> {
	return pushCategorySchema.array().parse(await invoke("push_categories"));
}

export async function setPushCategory(
	category: PushCategoryName,
	enabled: boolean,
): Promise<void> {
	await invoke("push_set_category", { category, enabled });
}

export async function openPushCategorySettings(
	category: PushCategoryName,
): Promise<void> {
	await invoke("push_open_category_settings", { category });
}

export async function notificationsPermitted(): Promise<boolean> {
	return (await invoke<boolean>("push_notifications_permitted")) === true;
}

export async function requestNotifications(): Promise<boolean> {
	return (await invoke<boolean>("push_request_notifications")) === true;
}

export async function takePushDeeplink(): Promise<string | null> {
	return (await invoke<string | null>("push_take_deeplink")) ?? null;
}

export async function watchPush(
	handler: (signal: PushSignal) => void,
): Promise<void> {
	const onEvent = new Channel<unknown>();
	onEvent.onmessage = (payload) => {
		const signal = pushSignalSchema.safeParse(payload);
		if (signal.success) handler(signal.data);
	};
	await invoke("push_watch", { onEvent });
}
