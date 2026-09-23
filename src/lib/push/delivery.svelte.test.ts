import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	addon,
	addonInstalled,
	freshModule,
	inFast,
	installNow,
	order,
	preferences,
	push,
	recordOrder,
	resetPushMocks,
	toastDetails,
	toastLabel,
	toasts,
	token,
} from "./push-test-helpers";

vi.mock("./index", () => push);
vi.mock("$lib/updates/addon.svelte", () => addon);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("$lib/api/error-toast", () => toasts);
vi.mock("$lib/app-data/preferences.svelte", () => preferences);

beforeEach(resetPushMocks);

describe("turning Fast mode on", () => {
	it("retires any old token and registers a fresh one with Grindr before it switches Fast mode on", async () => {
		recordOrder();
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(order).toEqual(["delete", "register", "enable"]);
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("still switches Fast mode on when the old token cannot be deleted", async () => {
		push.deletePushToken.mockRejectedValue(new Error("gone"));
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(module.notificationSettings.mode).toBe("fast");
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("only shows Fast mode once every step has succeeded", async () => {
		let finish = () => {};
		push.setMode.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const module = await freshModule();

		const selecting = module.selectNotificationMode("fast");
		await vi.waitFor(() => {
			expect(push.setMode).toHaveBeenCalledWith("fast");
		});

		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.phase).toBe("enablingFast");
		finish();
		await selecting;
		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.phase).toBe("idle");
	});

	it("stays on Slow mode and toasts when Grindr refuses the token", async () => {
		account.registerPushToken.mockRejectedValue(new Error("500"));
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.phase).toBe("idle");
		expect(toastLabel()).toBe(
			"Couldn't enable the fast mode for push notifications",
		);
	});

	it("keeps the toast short and puts the reason in its details", async () => {
		const failure = new Error("no firebase");
		push.mintPushToken.mockRejectedValue(failure);
		push.pushErrorReason.mockReturnValue("firebaseUnavailable");
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(account.registerPushToken).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(toastLabel()).toBe(
			"Couldn't enable the fast mode for push notifications",
		);
		expect(toastDetails()).toMatchObject({
			message: "This device has no Google Play services or microG.",
			cause: failure,
		});
	});

	it("does nothing when the chosen mode is already the current one", async () => {
		const module = await freshModule();

		await module.selectNotificationMode("slow");

		expect(push.setMode).not.toHaveBeenCalled();
	});
});

describe("a missing FCM service", () => {
	beforeEach(() => {
		push.fcmServiceInstalled.mockResolvedValue(false);
	});

	it("asks before downloading it, with no pending state and Slow mode still selected", async () => {
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.addonDialog).toBe("install");
		expect(module.notificationSettings.phase).toBe("idle");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(addon.addonFlow).not.toHaveBeenCalled();
		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("asks a build that cannot install add-ons to install it by hand", async () => {
		addon.addonInstallerAvailable.mockReturnValue(false);
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.addonDialog).toBe("manual");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("closes the dialog and keeps Slow mode while the add-on installs", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");

		await module.continueToAddon();

		expect(installNow).toHaveBeenCalled();
		expect(module.notificationSettings.addonDialog).toBeNull();
		expect(module.notificationSettings.phase).toBe("idle");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(push.setMode).not.toHaveBeenCalled();
	});

	it("turns Fast mode on once the add-on it installed arrives, with no settings page open", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		await module.continueToAddon();
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.phase).toBe("idle");
	});

	it("keeps waiting while the add-on is still missing", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		await module.continueToAddon();

		await addonInstalled();
		push.fcmServiceInstalled.mockResolvedValue(true);
		await addonInstalled();

		expect(push.addonReady).toHaveBeenCalledOnce();
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("ignores a later add-on install nobody asked for", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		await module.continueToAddon();
		push.fcmServiceInstalled.mockResolvedValue(true);
		await addonInstalled();
		await module.selectNotificationMode("slow");
		push.setMode.mockClear();

		await addonInstalled();

		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("forgets the pending install once the user picks a mode again", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		await module.continueToAddon();
		await module.selectNotificationMode("fast");
		module.dismissAddonDialog();
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(push.setMode).not.toHaveBeenCalled();
	});

	it("does not register a device whose notifications went off during the install", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		await module.continueToAddon();
		preferences.stored.notificationsEnabled = false;
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(account.registerPushToken).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
	});
});

describe("going back to Slow mode", () => {
	it("unregisters the device before it stops Fast mode", async () => {
		const module = await inFast();
		recordOrder();

		await module.selectNotificationMode("slow");

		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
		expect(order).toEqual(["unregister", "disable", "delete"]);
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("still switches when the add-on cannot delete its token", async () => {
		const module = await inFast();
		push.deletePushToken.mockRejectedValue(new Error("gone"));

		await module.selectNotificationMode("slow");

		expect(module.notificationSettings.mode).toBe("slow");
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("keeps showing Fast mode and toasts when Android refuses the switch", async () => {
		const module = await inFast();
		push.setMode.mockRejectedValueOnce(new Error("no JobScheduler"));

		await module.selectNotificationMode("slow");

		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.phase).toBe("idle");
		expect(toastLabel()).toBe(
			"Couldn't switch push notifications to the slow mode",
		);
	});

	it("leaves Grindr alone when Android is already in Slow mode", async () => {
		const module = await freshModule();
		await module.selectNotificationMode("fast");
		account.unregisterPushToken.mockClear();

		await module.selectNotificationMode("slow");

		expect(account.unregisterPushToken).not.toHaveBeenCalled();
	});
});

describe("falling back to Slow mode", () => {
	it("switches Android to Slow mode, shows it and says why", async () => {
		const module = await inFast();
		push.pushErrorReason.mockReturnValue("addonDisabled");

		await module.fallBackToSlow({ error: new Error("disabled") });

		expect(push.setMode).toHaveBeenCalledWith("slow");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(toastLabel()).toBe(
			"Couldn't enable the fast mode for push notifications",
		);
		expect(toastDetails()).toMatchObject({
			message: expect.stringMatching(/^The FCM service is disabled/),
		});
	});

	it("keeps showing Fast mode and reports the refused fallback", async () => {
		const module = await inFast();
		const refusal = new Error("ipc");
		push.setMode.mockRejectedValueOnce(refusal);
		push.pushErrorReason.mockReturnValue("addonDisabled");

		await module.fallBackToSlow({ error: new Error("disabled") });

		expect(module.notificationSettings.mode).toBe("fast");
		expect(toastLabel()).toBe(
			"Couldn't switch push notifications to the slow mode",
		);
		expect(toastDetails()).toBe(refusal);
	});
});
