import { Channel, invoke } from "@tauri-apps/api/core";

import { asAppError } from "#lib/api/methods.ts";
import {
	currentPlatform,
	isAndroidPlatform,
	isDesktopPlatform,
} from "#lib/platform/os.ts";
import { FCM_COMPONENT } from "#lib/updates/components.ts";
import { getInstalledVersion } from "#lib/updates/index.ts";
import {
	type Announcement,
	type FastSource,
	fastSourceSchema,
	type NotificationMode,
	notificationModeSchema,
	type NotificationPermission,
	notificationPermissionSchema,
	type PushCategory,
	type PushCategoryName,
	pushCategorySchema,
	type PushErrorReason,
	pushErrorSchema,
	type PushSignal,
	pushSignalSchema,
	type PushToken,
	pushTokenSchema,
	type RelayCommit,
	relayCommitSchema,
	type RelayStatus,
	relayStatusSchema,
	shownConversationsSchema,
	TAP_TAG_PREFIX,
} from "./types";

export * from "./types";

export function pushAvailableHere(): boolean {
	return isAndroidPlatform() || isDesktopPlatform();
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

export async function notificationsEnabled(): Promise<boolean> {
	return (await invoke<boolean>("push_notifications_enabled")) === true;
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
	await invoke("push_set_notifications_enabled", { enabled });
}

export async function dismissPushConversation({
	conversationId,
	messageId,
}: {
	conversationId: string;
	messageId?: string;
}): Promise<void> {
	await invoke("push_dismiss_conversation", { conversationId, messageId });
}

export async function shownPushConversations(): Promise<string[]> {
	const tags = shownConversationsSchema.parse(
		await invoke("push_shown_conversations"),
	);
	return tags.filter((tag) => !tag.startsWith(TAP_TAG_PREFIX));
}

export async function openNotificationSettings(): Promise<void> {
	await invoke("push_open_notification_settings");
}

export async function currentMode(): Promise<NotificationMode> {
	return notificationModeSchema.parse(await invoke("push_mode"));
}

export async function setMode(mode: NotificationMode): Promise<void> {
	await invoke("push_set_mode", { mode });
}

export async function inFastMode(): Promise<boolean> {
	return (await currentMode().catch(() => "slow")) === "fast";
}

export async function currentFastSource(): Promise<FastSource | null> {
	return (
		fastSourceSchema.nullish().parse(await invoke("push_fast_source")) ??
		null
	);
}

export async function setFastSource(source: FastSource): Promise<void> {
	await invoke("push_set_fast_source", { source });
}

export async function playServicesAvailable(): Promise<boolean> {
	return (await invoke<boolean | null>("push_play_services")) === true;
}

export function fastModeOptions(): FastSource[] {
	switch (currentPlatform()) {
		case "android":
			return ["addon", "relay"];
		case "ios":
			return [];
		case "linux":
		case "macos":
		case "windows":
		case "freebsd":
		case "dragonfly":
		case "netbsd":
		case "openbsd":
		case "solaris":
		case "web":
			return [];
	}
}

export async function beginRelaySetup(): Promise<void> {
	await invoke("push_relay_begin");
}

export async function saveRelayConfig(): Promise<boolean> {
	return (await invoke<boolean | null>("push_relay_save_config")) === true;
}

export async function shareRelayConfig(): Promise<void> {
	await invoke("push_relay_share_config");
}

export async function awaitRelay(): Promise<void> {
	await invoke("push_relay_await");
}

export async function commitRelay(code: string): Promise<RelayCommit> {
	return relayCommitSchema.parse(await invoke("push_relay_commit", { code }));
}

export async function registerRelay(): Promise<void> {
	await invoke("push_relay_register");
}

export async function unregisterRelay(): Promise<void> {
	await invoke("push_relay_unregister");
}

export async function cancelRelaySetup(): Promise<void> {
	await invoke("push_relay_cancel");
}

export async function forgetRelay(): Promise<void> {
	await invoke("push_relay_forget");
}

export async function dropRelayOrphans(): Promise<void> {
	await invoke("push_relay_drop_orphans");
}

export async function relayStatus(): Promise<RelayStatus> {
	return (
		relayStatusSchema
			.nullish()
			.parse(await invoke("push_relay_status")) ?? {
			paired: false,
			broken: false,
		}
	);
}

export async function fcmServiceInstalled(): Promise<boolean> {
	return (
		(await getInstalledVersion(FCM_COMPONENT).catch(() => null)) !== null
	);
}

export async function pushCategories(): Promise<PushCategory[]> {
	return pushCategorySchema.array().parse(await invoke("push_categories"));
}

export async function setPushCategory({
	category,
	enabled,
}: {
	category: PushCategoryName;
	enabled: boolean;
}): Promise<void> {
	await invoke("push_set_category", { category, enabled });
}

export async function openPushCategorySettings(
	category: PushCategoryName,
): Promise<void> {
	await invoke("push_open_category_settings", { category });
}

export async function notificationPermission(): Promise<NotificationPermission> {
	return notificationPermissionSchema.parse(
		await invoke("push_notification_permission"),
	);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
	return notificationPermissionSchema.parse(
		await invoke("push_request_notification_permission"),
	);
}

export async function notify(announcement: Announcement): Promise<void> {
	await invoke("push_notify", { announcement });
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
