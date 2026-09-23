import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	addon,
	freshModule,
	granted,
	inFast,
	nativeMode,
	order,
	preferences,
	push,
	recordOrder,
	resetPushMocks,
	switchedOn,
	toastDetails,
	toastLabel,
	toasts,
	token,
} from "./push-test-helpers";
import type { NotificationPermission } from "./types";

vi.mock("./index", () => push);
vi.mock("$lib/updates/addon.svelte", () => addon);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("$lib/api/error-toast", () => toasts);
vi.mock("$lib/app-data/preferences.svelte", () => preferences);

beforeEach(resetPushMocks);

describe("a switch flipped while the app is catching up", () => {
	it("keeps notifications off when the reconcile started before the switch", async () => {
		const permission = Promise.withResolvers<NotificationPermission>();
		push.notificationPermission.mockReturnValueOnce(permission.promise);
		const module = await freshModule();

		const reconciled = module.reconcileNotifications();
		await vi.waitFor(() =>
			expect(push.notificationPermission).toHaveBeenCalled(),
		);
		const toggled = module.toggleNotifications(false);
		permission.resolve(granted);
		await Promise.all([reconciled, toggled]);

		expect(push.setNotificationsEnabled).toHaveBeenLastCalledWith(false);
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("shows the switch working while it waits for the reconcile", async () => {
		const permission = Promise.withResolvers<NotificationPermission>();
		push.notificationPermission.mockReturnValueOnce(permission.promise);
		const module = await freshModule();

		const reconciled = module.reconcileNotifications();
		await vi.waitFor(() =>
			expect(push.notificationPermission).toHaveBeenCalled(),
		);
		const toggled = module.toggleNotifications(false);

		expect(module.notificationSettings.busy).toBe(true);
		permission.resolve(granted);
		await Promise.all([reconciled, toggled]);
		expect(module.notificationSettings.busy).toBe(false);
	});
});

describe("the notifications master switch", () => {
	beforeEach(() => {
		preferences.stored.notificationsEnabled = false;
	});

	it("registers a fresh token when notifications return in Fast mode", async () => {
		nativeMode("fast");
		recordOrder();
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(order).toEqual(["arm", "delete", "register"]);
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("leaves a Slow mode account alone rather than minting a token it cannot use", async () => {
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.mintPushToken).not.toHaveBeenCalled();
	});

	it.each([
		null,
		"failed",
		"addonDisabled",
		"addonRefused",
		"addonUntrusted",
		"addonUnavailable",
	] as const)(
		"falls back to Slow mode when registering fails with %s on the way back on",
		async (reason) => {
			account.registerPushToken.mockRejectedValue(new Error("refused"));
			push.pushErrorReason.mockReturnValue(reason);
			const module = await inFast();

			await module.toggleNotifications(true);

			expect(push.setMode).toHaveBeenCalledWith("slow");
			expect(module.notificationSettings.mode).toBe("slow");
			expect(module.notificationSettings.enabled).toBe(true);
			expect(toastLabel()).toBe(
				"Couldn't enable the fast mode for push notifications",
			);
		},
	);

	it("rolls the native switch back and toasts when the preference cannot be saved", async () => {
		preferences.setPreferences.mockRejectedValueOnce(new Error("disk"));
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.setNotificationsEnabled).toHaveBeenLastCalledWith(false);
		expect(module.notificationSettings.enabled).toBe(false);
		expect(toastLabel()).toBe("Couldn't turn on notifications");
	});

	it("stops rendering before it asks Grindr to forget the token", async () => {
		nativeMode("fast");
		const module = await switchedOn();
		recordOrder();

		await module.toggleNotifications(false);

		expect(order).toEqual(["disarm", "unregister", "delete"]);
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("leaves the delivery mode alone when notifications are turned off", async () => {
		nativeMode("fast");
		const module = await switchedOn();

		await module.toggleNotifications(false);

		expect(push.setMode).not.toHaveBeenCalled();
	});

	it("toasts instead of pretending notifications went off", async () => {
		const module = await switchedOn();
		push.setNotificationsEnabled.mockRejectedValueOnce(new Error("ipc"));

		await module.toggleNotifications(false);

		expect(module.notificationSettings.enabled).toBe(true);
		expect(module.notificationSettings.phase).toBe("idle");
		expect(toastLabel()).toBe("Couldn't turn off notifications");
	});
});

describe("reconciling with Android", () => {
	it("tears everything down silently when Android revoked the permission", async () => {
		nativeMode("fast");
		push.notificationPermission.mockResolvedValue({
			granted: false,
			state: "denied",
		});
		recordOrder();
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.enabled).toBe(false);
		expect(order).toEqual(["disarm", "unregister", "delete"]);
		expect(push.openNotificationSettings).not.toHaveBeenCalled();
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("mirrors the stored preference when the permission holds", async () => {
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(true);
		expect(module.notificationSettings.enabled).toBe(true);
	});

	it("does not turn notifications back on when the permission is granted again", async () => {
		preferences.stored.notificationsEnabled = false;
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.enabled).toBe(false);
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});

	it("keeps notifications on when Android cannot say whether they are allowed", async () => {
		push.notificationPermission.mockRejectedValue(new Error("ipc"));
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.enabled).toBe(true);
		expect(push.deletePushToken).not.toHaveBeenCalled();
	});

	it("runs once for overlapping callers", async () => {
		const module = await freshModule();

		await Promise.all([
			module.reconcileNotifications(),
			module.reconcileNotifications(),
		]);

		expect(push.notificationPermission).toHaveBeenCalledOnce();
	});

	it("starts on the mode Android remembers", async () => {
		nativeMode("fast");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("falls back to Slow mode with a toast when the add-on went away while Open Grind was away", async () => {
		nativeMode("fast");
		push.addonReady.mockRejectedValue(new Error("uninstalled"));
		push.pushErrorReason.mockReturnValue("addonUnavailable");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.setMode).toHaveBeenCalledWith("slow");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(toastLabel()).toBe(
			"Couldn't enable the fast mode for push notifications",
		);
		expect(toastDetails()).toMatchObject({
			message: expect.stringMatching(/^Open Grind couldn't reach/),
		});
	});

	it.each(["failed", null] as const)(
		"keeps Fast mode quietly when the add-on check fails with %s",
		async (reason) => {
			nativeMode("fast");
			push.addonReady.mockRejectedValue(new Error("ipc"));
			push.pushErrorReason.mockReturnValue(reason);
			const module = await freshModule();

			await module.reconcileNotifications();

			expect(push.setMode).not.toHaveBeenCalled();
			expect(module.notificationSettings.mode).toBe("fast");
			expect(toasts.showErrorToast).not.toHaveBeenCalled();
		},
	);

	it("never checks the add-on in Slow mode", async () => {
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.addonReady).not.toHaveBeenCalled();
	});
});
