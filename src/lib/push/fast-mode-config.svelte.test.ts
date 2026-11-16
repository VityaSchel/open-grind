import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	addon,
	addonInstalled,
	atRelayStep,
	configuredWith,
	failureLabels,
	hintToast,
	holdRelayConnection,
	installNow,
	nativeMode,
	order,
	preferences,
	push,
	pushFailure,
	recordOrder,
	resetPushMocks,
	sonner,
	toastDetails,
	toastLabel,
	toasts,
} from "./push-test-helpers";
import type { RelayCommit } from "./types";

vi.mock("./index", () => push);
vi.mock("#lib/updates/addon.svelte.ts", () => addon);
vi.mock("#lib/api/settings/account.ts", () => account);
vi.mock("#lib/api/error-toast.ts", () => toasts);
vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);
vi.mock("svelte-sonner", () => sonner);

beforeEach(resetPushMocks);

function settled(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("tapping Fast Mode before any source is set up", () => {
	it("opens the Configure dialog without touching Grindr or Android", async () => {
		const module = await configuredWith(null);

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(module.notificationSettings.mode).toBe("slow");
		expect(push.setMode).not.toHaveBeenCalled();
		expect(push.registerRelay).not.toHaveBeenCalled();
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it("follows the source Android reports at the tap rather than a stale one", async () => {
		const module = await configuredWith(null);
		push.currentFastSource.mockResolvedValue("addon");

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.configDialogOpen).toBe(false);
		expect(module.notificationSettings.fastSource).toBe("addon");
		expect(module.notificationSettings.mode).toBe("fast");
	});
});

describe("tapping Fast Mode with fcm-relay set up", () => {
	it("registers the fcm-relay token with Grindr before it switches Fast Mode on", async () => {
		const module = await configuredWith("relay");
		recordOrder();

		await module.selectNotificationMode("fast");

		expect(order).toEqual(["registerRelay", "enable"]);
		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.phase).toBe("idle");
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it.each([
		{ paired: true, broken: true },
		{ paired: false, broken: false },
	])(
		"resets a pairing that stopped working and opens Configure (%o)",
		async (status) => {
			push.relayStatus.mockResolvedValue(status);
			const module = await configuredWith("relay");
			recordOrder();

			await module.selectNotificationMode("fast");

			expect(order).toEqual(["unregisterRelay", "forgetRelay"]);
			expect(module.notificationSettings.fastSource).toBeNull();
			expect(module.notificationSettings.mode).toBe("slow");
			expect(module.notificationSettings.configDialogOpen).toBe(true);
			expect(sonner.toast.error).not.toHaveBeenCalled();
		},
	);

	it("resets the pairing when Grindr now belongs to another account", async () => {
		push.registerRelay.mockRejectedValue(
			pushFailure("relayAccountChanged"),
		);
		const module = await configuredWith("relay");

		await module.selectNotificationMode("fast");

		expect(push.forgetRelay).toHaveBeenCalled();
		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(module.notificationSettings.fastSource).toBeNull();
	});

	it("stays on Slow Mode and says why when Grindr refuses the token", async () => {
		const failure = pushFailure("relayRegisterFailed");
		push.registerRelay.mockRejectedValue(failure);
		const module = await configuredWith("relay");

		await module.selectNotificationMode("fast");

		expect(push.setMode).not.toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(toastLabel()).toBe(failureLabels.enableFastMode);
		expect(toastDetails()).toMatchObject({
			message: expect.stringMatching(/^Grindr didn't accept/),
			cause: failure,
		});
	});
});

describe("choosing the FCM service add-on in the Configure dialog", () => {
	it("registers a fresh add-on token, then records the source, then switches Fast Mode on", async () => {
		const module = await configuredWith(null);
		module.openFastModeConfig();
		recordOrder();

		await module.chooseFastSource("addon");

		expect(order).toEqual(["delete", "register", "source:addon", "enable"]);
		expect(module.notificationSettings.fastSource).toBe("addon");
		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
	});

	it("retires fcm-relay only after the add-on works", async () => {
		const module = await configuredWith("relay");
		module.openFastModeConfig();
		recordOrder();

		await module.chooseFastSource("addon");

		expect(order).toEqual([
			"delete",
			"register",
			"source:addon",
			"enable",
			"unregisterRelay",
			"forgetRelay",
		]);
	});

	it("keeps fcm-relay when the add-on cannot register", async () => {
		account.registerPushToken.mockRejectedValue(new Error("500"));
		const module = await configuredWith("relay");
		module.openFastModeConfig();

		await module.chooseFastSource("addon");

		expect(push.setFastSource).not.toHaveBeenCalled();
		expect(push.unregisterRelay).not.toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(toastLabel()).toBe(failureLabels.enableFastMode);
	});

	it("shows the add-on option loading and both options blocked while it switches", async () => {
		const ready = Promise.withResolvers<void>();
		push.addonReady.mockReturnValue(ready.promise);
		const module = await configuredWith(null);
		module.openFastModeConfig();

		const choosing = module.chooseFastSource("addon");
		await vi.waitFor(() => {
			expect(push.addonReady).toHaveBeenCalled();
		});

		expect(module.notificationSettings.pendingSource).toBe("addon");
		expect(module.notificationSettings.busy).toBe(true);
		await module.chooseFastSource("relay");
		expect(push.beginRelaySetup).not.toHaveBeenCalled();
		ready.resolve();
		await choosing;
		expect(module.notificationSettings.busy).toBe(false);
	});

	it("does nothing when the add-on already delivers Fast Mode", async () => {
		nativeMode("fast");
		const module = await configuredWith("addon");

		await module.chooseFastSource("addon");

		expect(push.addonReady).not.toHaveBeenCalled();
		expect(push.setFastSource).not.toHaveBeenCalled();
	});

	it("turns Fast Mode back on with the installed add-on when it is the source in Slow Mode", async () => {
		const module = await configuredWith("addon");
		module.openFastModeConfig();
		recordOrder();

		await module.chooseFastSource("addon");

		expect(order).toEqual(["delete", "register", "source:addon", "enable"]);
		expect(module.notificationSettings.fastSource).toBe("addon");
		expect(module.notificationSettings.mode).toBe("fast");
		expect(push.unregisterRelay).not.toHaveBeenCalled();
	});

	it("offers the install when the add-on is the source but no longer installed", async () => {
		push.fcmServiceInstalled.mockResolvedValue(false);
		const module = await configuredWith("addon");
		module.openFastModeConfig();

		await module.chooseFastSource("addon");

		expect(module.notificationSettings.addonDialog).toBe("install");
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("switches Fast Mode on and closes the dialog once the reinstalled add-on lands", async () => {
		push.fcmServiceInstalled.mockResolvedValue(false);
		const module = await configuredWith("addon");
		module.openFastModeConfig();
		await module.chooseFastSource("addon");
		await module.continueToAddon();
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.fastSource).toBe("addon");
		expect(module.notificationSettings.configDialogOpen).toBe(false);
	});

	it("does nothing while notifications are off", async () => {
		const module = await configuredWith(null);
		preferences.stored.notificationsEnabled = false;

		await module.chooseFastSource("addon");
		await module.chooseFastSource("relay");

		expect(push.addonReady).not.toHaveBeenCalled();
		expect(push.beginRelaySetup).not.toHaveBeenCalled();
	});
});

describe("installing the add-on from the Configure dialog", () => {
	beforeEach(() => {
		push.fcmServiceInstalled.mockResolvedValue(false);
	});

	async function installing() {
		const module = await configuredWith(null);
		module.openFastModeConfig();
		await module.chooseFastSource("addon");
		await module.continueToAddon();
		push.fcmServiceInstalled.mockResolvedValue(true);
		return module;
	}

	it("asks before it downloads the add-on, with nothing loading", async () => {
		const module = await configuredWith(null);
		module.openFastModeConfig();

		await module.chooseFastSource("addon");

		expect(module.notificationSettings.addonDialog).toBe("install");
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("selects the add-on and closes the dialog once the install it started lands", async () => {
		const module = await installing();
		recordOrder();

		await addonInstalled();

		expect(installNow).toHaveBeenCalled();
		expect(order).toEqual(["delete", "register", "source:addon", "enable"]);
		expect(module.notificationSettings.fastSource).toBe("addon");
		expect(module.notificationSettings.configDialogOpen).toBe(false);
	});

	it("keeps the dialog open when the add-on cannot register after the install", async () => {
		const module = await installing();
		account.registerPushToken.mockRejectedValue(new Error("500"));

		await addonInstalled();

		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(module.notificationSettings.fastSource).toBeNull();
		expect(toastLabel()).toBe(failureLabels.enableFastMode);
	});

	it("forgets the install once the dialog closes", async () => {
		const module = await installing();

		await module.closeFastModeConfig();
		await addonInstalled();

		expect(push.addonReady).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBeNull();
	});

	it("forgets the install once the user picks fcm-relay instead", async () => {
		const module = await installing();
		holdRelayConnection();

		await module.chooseFastSource("relay");
		await module.cancelRelaySetupFlow();
		await addonInstalled();

		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("follows only the newest install attempt", async () => {
		const module = await installing();
		push.fcmServiceInstalled.mockResolvedValue(false);
		await module.chooseFastSource("addon");
		module.dismissAddonDialog();
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("does not register a device whose notifications went off during the install", async () => {
		const module = await installing();
		preferences.stored.notificationsEnabled = false;

		await addonInstalled();

		expect(account.registerPushToken).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBeNull();
	});
});

describe("choosing fcm-relay in the Configure dialog", () => {
	it("starts the setup and shows the config screen while it listens for the relay", async () => {
		holdRelayConnection();
		const module = await configuredWith(null);
		module.openFastModeConfig();

		await module.chooseFastSource("relay");

		expect(push.beginRelaySetup).toHaveBeenCalledOnce();
		expect(push.awaitRelay).toHaveBeenCalledOnce();
		expect(module.notificationSettings.relayStep).toBe("config");
		expect(module.notificationSettings.pendingSource).toBe("relay");
		expect(module.notificationSettings.busy).toBe(true);
	});

	it("blocks both options while the distributor is being chosen", async () => {
		holdRelayConnection();
		const begin = Promise.withResolvers<void>();
		push.beginRelaySetup.mockReturnValue(begin.promise);
		const module = await configuredWith(null);

		const choosing = module.chooseFastSource("relay");

		expect(module.notificationSettings.pendingSource).toBe("relay");
		expect(module.notificationSettings.relayStep).toBeNull();
		begin.resolve();
		await choosing;
		expect(module.notificationSettings.relayStep).toBe("config");
	});

	it("moves to the verification screen once fcm-relay connects", async () => {
		const connection = holdRelayConnection();
		const module = await atRelayStep("config");
		module.confirmRelayConfigSaved();
		expect(module.notificationSettings.relayStep).toBe("waiting");

		connection.resolve();

		await vi.waitFor(() => {
			expect(module.notificationSettings.relayStep).toBe("verify");
		});
	});

	it("moves to waiting only from the config screen", async () => {
		const module = await atRelayStep("verify");

		module.confirmRelayConfigSaved();

		expect(module.notificationSettings.relayStep).toBe("verify");
	});

	it("starts a fresh setup even when fcm-relay is already the source", async () => {
		holdRelayConnection();
		const module = await configuredWith("relay");

		await module.chooseFastSource("relay");

		expect(push.beginRelaySetup).toHaveBeenCalledOnce();
	});

	it.each(["relayCancelled", "relayDistributorUnavailable"] as const)(
		"ends quietly when the setup ends with %s",
		async (reason) => {
			push.beginRelaySetup.mockRejectedValue(pushFailure(reason));
			const module = await configuredWith(null);

			await module.chooseFastSource("relay");

			expect(module.notificationSettings.pendingSource).toBeNull();
			expect(module.notificationSettings.relayStep).toBeNull();
			expect(toasts.showErrorToast).not.toHaveBeenCalled();
			expect(sonner.toast.error).not.toHaveBeenCalled();
		},
	);

	it.each([
		["relayNoDistributor", failureLabels.relayNoDistributor],
		["relayActionRequired", failureLabels.relayActionRequired],
	] as const)("explains %s in a short hint", async (reason, label) => {
		push.beginRelaySetup.mockRejectedValue(pushFailure(reason));
		const module = await configuredWith(null);

		await module.chooseFastSource("relay");

		expect(hintToast().label).toBe(label);
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
		expect(module.notificationSettings.pendingSource).toBeNull();
	});

	it("toasts any other setup failure with the reason in its details", async () => {
		const failure = pushFailure("relayTimedOut");
		push.beginRelaySetup.mockRejectedValue(failure);
		const module = await configuredWith(null);

		await module.chooseFastSource("relay");

		expect(toastLabel()).toBe(failureLabels.relaySetup);
		expect(toastDetails()).toMatchObject({
			message: "The UnifiedPush distributor app didn't answer in time.",
			cause: failure,
		});
	});

	it("closes the config screen and toasts when the distributor drops the setup", async () => {
		const connection = holdRelayConnection();
		const module = await atRelayStep("config");

		connection.reject(pushFailure("relaySetupLost"));

		await vi.waitFor(() => {
			expect(module.notificationSettings.relayStep).toBeNull();
		});
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(toastLabel()).toBe(failureLabels.relaySetup);
	});
});

describe("cancelling the fcm-relay setup", () => {
	it("tells Android to cancel and returns to the Configure dialog", async () => {
		const connection = holdRelayConnection();
		const module = await atRelayStep("config");

		await module.cancelRelaySetupFlow();
		connection.reject(pushFailure("relayCancelled"));

		expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
		expect(module.notificationSettings.relayStep).toBeNull();
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
		await Promise.resolve();
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("ignores a distributor choice that comes back after the cancel", async () => {
		const begin = Promise.withResolvers<void>();
		push.beginRelaySetup.mockReturnValue(begin.promise);
		const module = await configuredWith(null);

		const choosing = module.chooseFastSource("relay");
		await module.cancelRelaySetupFlow();
		begin.resolve();
		await choosing;

		expect(module.notificationSettings.relayStep).toBeNull();
		expect(push.awaitRelay).not.toHaveBeenCalled();
	});

	it("ignores a connection that arrives after the cancel", async () => {
		const connection = holdRelayConnection();
		const module = await atRelayStep("config");

		await module.cancelRelaySetupFlow();
		connection.resolve();
		await Promise.resolve();

		expect(module.notificationSettings.relayStep).toBeNull();
	});

	async function restartedSetup() {
		const first = holdRelayConnection();
		const module = await atRelayStep("config");
		await module.cancelRelaySetupFlow();
		holdRelayConnection();
		await module.chooseFastSource("relay");
		return { module, first };
	}

	it("keeps a newer setup on its config screen when the cancelled one connects late", async () => {
		const { module, first } = await restartedSetup();

		first.resolve();
		await settled();

		expect(module.notificationSettings.relayStep).toBe("config");
		expect(module.notificationSettings.pendingSource).toBe("relay");
	});

	it.each(["relayCancelled", "relaySetupLost"] as const)(
		"keeps a newer setup running when the cancelled one ends late with %s",
		async (reason) => {
			const { module, first } = await restartedSetup();

			first.reject(pushFailure(reason));
			await settled();

			expect(module.notificationSettings.relayStep).toBe("config");
			expect(module.notificationSettings.pendingSource).toBe("relay");
			expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
			expect(toasts.showErrorToast).not.toHaveBeenCalled();
			expect(sonner.toast.error).not.toHaveBeenCalled();
		},
	);

	it("cancels the setup when the Configure dialog closes", async () => {
		holdRelayConnection();
		const module = await atRelayStep("config");

		await module.closeFastModeConfig();

		expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
		expect(module.notificationSettings.configDialogOpen).toBe(false);
		expect(module.notificationSettings.relayStep).toBeNull();
	});

	it("leaves Android alone when no setup is running", async () => {
		const module = await configuredWith(null);
		module.openFastModeConfig();

		await module.closeFastModeConfig();

		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
	});
});

describe("saving and sharing the fcm-relay config", () => {
	it("asks Android to save and to share the config", async () => {
		holdRelayConnection();
		const module = await atRelayStep("config");

		await module.saveRelayConfigFile();
		await module.shareRelayConfigFile();

		expect(push.saveRelayConfig).toHaveBeenCalledOnce();
		expect(push.shareRelayConfig).toHaveBeenCalledOnce();
		expect(module.notificationSettings.relayStep).toBe("config");
	});

	it("toasts a failed save and keeps the config screen", async () => {
		holdRelayConnection();
		push.saveRelayConfig.mockRejectedValue(pushFailure("relaySaveFailed"));
		const module = await atRelayStep("config");

		await module.saveRelayConfigFile();

		expect(toastLabel()).toBe(failureLabels.relaySave);
		expect(toastDetails()).toMatchObject({
			message: "Android couldn't write the config file.",
		});
		expect(module.notificationSettings.relayStep).toBe("config");
	});

	it("toasts a failed share and keeps the config screen", async () => {
		holdRelayConnection();
		push.shareRelayConfig.mockRejectedValue(
			pushFailure("relayShareFailed"),
		);
		const module = await atRelayStep("config");

		await module.shareRelayConfigFile();

		expect(toastLabel()).toBe(failureLabels.relayShare);
		expect(module.notificationSettings.relayStep).toBe("config");
	});

	it("does nothing without a running setup", async () => {
		const module = await configuredWith(null);

		await module.saveRelayConfigFile();
		await module.shareRelayConfigFile();

		expect(push.saveRelayConfig).not.toHaveBeenCalled();
		expect(push.shareRelayConfig).not.toHaveBeenCalled();
	});
});

describe("reconciling while an fcm-relay setup runs", () => {
	it("still checks the permission while the setup waits for its config", async () => {
		holdRelayConnection();
		const module = await atRelayStep("config");
		push.notificationPermission.mockResolvedValue({
			granted: false,
			state: "denied",
		});

		await module.reconcileNotifications();

		expect(module.notificationSettings.enabled).toBe(false);
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});

	it("ends the setup and closes the Configure dialog when the permission was revoked", async () => {
		holdRelayConnection();
		const module = await atRelayStep("config");
		module.confirmRelayConfigSaved();
		push.notificationPermission.mockResolvedValue({
			granted: false,
			state: "denied",
		});

		await module.reconcileNotifications();

		expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
		expect(module.notificationSettings.relayStep).toBeNull();
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(false);
	});

	it("checks Fast Mode delivery while the setup waits for fcm-relay", async () => {
		holdRelayConnection();
		nativeMode("fast");
		const module = await atRelayStep("config", "addon");
		module.confirmRelayConfigSaved();

		await module.reconcileNotifications();

		expect(push.addonReady).toHaveBeenCalledOnce();
		expect(module.notificationSettings.relayStep).toBe("waiting");
	});

	it.each(["config", "verify"] as const)(
		"keeps the setup at %s and stays quiet when the earlier pairing broke, then resets it once the setup ends",
		async (step) => {
			if (step === "config") holdRelayConnection();
			nativeMode("fast");
			const module = await atRelayStep(step, "relay");
			push.relayStatus.mockResolvedValue({ paired: true, broken: true });

			await module.reconcileNotifications();

			expect(push.relayStatus).toHaveBeenCalledOnce();
			expect(push.unregisterRelay).not.toHaveBeenCalled();
			expect(push.forgetRelay).not.toHaveBeenCalled();
			expect(push.cancelRelaySetup).not.toHaveBeenCalled();
			expect(sonner.toast.error).not.toHaveBeenCalled();
			expect(toasts.showErrorToast).not.toHaveBeenCalled();
			expect(module.notificationSettings.relayStep).toBe(step);
			expect(module.notificationSettings.pendingSource).toBe("relay");
			expect(module.notificationSettings.mode).toBe("fast");

			await module.closeFastModeConfig();
			await module.reconcileNotifications();

			expect(push.forgetRelay).toHaveBeenCalledOnce();
			expect(module.notificationSettings.mode).toBe("slow");
			expect(hintToast().label).toBe(failureLabels.relayStopped);
		},
	);

	it("keeps a setup that starts while the broken pairing is being unregistered", async () => {
		holdRelayConnection();
		nativeMode("fast");
		const module = await configuredWith("relay");
		const unregistering = Promise.withResolvers<void>();
		push.unregisterRelay.mockReturnValueOnce(unregistering.promise);
		push.relayStatus.mockResolvedValue({ paired: true, broken: true });
		const reconciling = module.reconcileNotifications();
		await vi.waitFor(() => {
			expect(push.unregisterRelay).toHaveBeenCalledOnce();
		});
		module.openFastModeConfig();
		await module.chooseFastSource("relay");

		unregistering.resolve();
		await reconciling;

		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(sonner.toast.error).not.toHaveBeenCalled();
		expect(module.notificationSettings.relayStep).toBe("config");
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("stays out of the way while the verification code is being committed", async () => {
		const commit = Promise.withResolvers<RelayCommit>();
		push.commitRelay.mockReturnValue(commit.promise);
		const module = await atRelayStep("verify");
		const submitting = module.submitRelayCode("658591");

		await module.reconcileNotifications();

		expect(push.currentMode).not.toHaveBeenCalled();
		expect(push.notificationPermission).not.toHaveBeenCalled();
		commit.resolve({ matched: false });
		await submitting;
	});

	it("stays out of the way while the add-on is being chosen", async () => {
		const ready = Promise.withResolvers<void>();
		push.addonReady.mockReturnValue(ready.promise);
		const module = await configuredWith(null);
		module.openFastModeConfig();
		const choosing = module.chooseFastSource("addon");
		await vi.waitFor(() => {
			expect(push.addonReady).toHaveBeenCalled();
		});

		await module.reconcileNotifications();

		expect(push.currentMode).not.toHaveBeenCalled();
		ready.resolve();
		await choosing;
	});
});
