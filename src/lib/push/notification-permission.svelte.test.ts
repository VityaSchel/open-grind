import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	addon,
	freshModule,
	granted,
	nativeMode,
	preferences,
	push,
	resetPushMocks,
	toasts,
	token,
} from "./push-test-helpers";
import type { NotificationPermission } from "./types";

vi.mock("./index", () => push);
vi.mock("$lib/updates/addon.svelte", () => addon);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("$lib/api/error-toast", () => toasts);
vi.mock("$lib/app-data/preferences.svelte", () => preferences);

const unasked: NotificationPermission = { granted: false, state: "prompt" };
const refusedOnce: NotificationPermission = {
	granted: false,
	state: "prompt-with-rationale",
};
const blocked: NotificationPermission = { granted: false, state: "denied" };

beforeEach(() => {
	resetPushMocks();
	preferences.stored.notificationsEnabled = false;
	push.notificationPermission.mockResolvedValue(unasked);
});

async function sentToSettings() {
	push.notificationPermission.mockResolvedValue(blocked);
	const module = await freshModule();
	await module.toggleNotifications(true);
	expect(push.openNotificationSettings).toHaveBeenCalledOnce();
	return module;
}

describe("asking for the notification permission", () => {
	it("asks Android before it turns anything on", async () => {
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.requestNotificationPermission).toHaveBeenCalledOnce();
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(true);
		expect(module.notificationSettings.enabled).toBe(true);
	});

	it.each([
		["the first time", refusedOnce],
		["for good", blocked],
	])(
		"stays off without opening settings when the user refuses the prompt %s",
		async (_, answer) => {
			push.requestNotificationPermission.mockResolvedValue(answer);
			const module = await freshModule();

			await module.toggleNotifications(true);

			expect(push.openNotificationSettings).not.toHaveBeenCalled();
			expect(push.setNotificationsEnabled).not.toHaveBeenCalled();
			expect(module.notificationSettings.enabled).toBe(false);
		},
	);

	it("sends a user Android no longer asks straight to its settings", async () => {
		const module = await sentToSettings();

		expect(push.requestNotificationPermission).not.toHaveBeenCalled();
		expect(module.notificationSettings.enabled).toBe(false);
	});
});

describe("coming back from Android settings", () => {
	it("turns notifications on when the permission was granted there", async () => {
		const module = await sentToSettings();
		push.notificationPermission.mockResolvedValue(granted);

		await module.reconcileNotifications();

		expect(push.setNotificationsEnabled).toHaveBeenLastCalledWith(true);
		expect(module.notificationSettings.enabled).toBe(true);
	});

	it("registers for Fast mode the same way the switch does", async () => {
		nativeMode("fast");
		const module = await sentToSettings();
		push.notificationPermission.mockResolvedValue(granted);

		await module.reconcileNotifications();

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("stays off when the user came back without granting it, and forgets the trip", async () => {
		const module = await sentToSettings();
		await module.reconcileNotifications();
		push.notificationPermission.mockResolvedValue(granted);

		await module.reconcileNotifications();

		expect(push.setNotificationsEnabled).not.toHaveBeenCalledWith(true);
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("does not remember a trip that never opened settings", async () => {
		push.notificationPermission.mockResolvedValue(blocked);
		push.openNotificationSettings.mockRejectedValue(
			new Error("settings-unavailable"),
		);
		const module = await freshModule();
		await module.toggleNotifications(true);
		push.notificationPermission.mockResolvedValue(granted);

		await module.reconcileNotifications();

		expect(module.notificationSettings.enabled).toBe(false);
	});
});
