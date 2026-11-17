import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	addon,
	appState,
	atRelayStep,
	failureLabels,
	freshModule,
	hintToast,
	inFast,
	navigation,
	order,
	preferences,
	push,
	pushFailure,
	recordOrder,
	resetPushMocks,
	sonner,
	toastLabel,
	toasts,
	token,
} from "./push-test-helpers";
import type { RelayCommit } from "./types";

vi.mock("./index", () => push);
vi.mock("#lib/updates/addon.svelte.ts", () => addon);
vi.mock("#lib/api/settings/account.ts", () => account);
vi.mock("#lib/api/error-toast.ts", () => toasts);
vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);
vi.mock("svelte-sonner", () => sonner);
vi.mock("$app/navigation", () => navigation);
vi.mock("$app/state", () => appState);

beforeEach(resetPushMocks);

function settled(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

async function atVerifyFrom(source: "addon" | "relay") {
	const module = await inFast(source);
	module.openFastModeConfig();
	await module.chooseFastSource("relay");
	await vi.waitFor(() => {
		expect(module.notificationSettings.relayStep).toBe("verify");
	});
	return module;
}

describe("entering the verification code", () => {
	it("waits for all six digits", async () => {
		const module = await atRelayStep("verify");

		await module.submitRelayCode("12345");
		await module.submitRelayCode("12a456");

		expect(push.commitRelay).not.toHaveBeenCalled();
	});

	it("marks a wrong code and stays on the verification screen", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const module = await atRelayStep("verify");

		await module.submitRelayCode("123456");

		expect(push.commitRelay).toHaveBeenCalledWith("123456");
		expect(module.notificationSettings.codeMismatch).toBe(true);
		expect(module.notificationSettings.committing).toBe(false);
		expect(module.notificationSettings.relayStep).toBe("verify");
		expect(push.registerRelay).not.toHaveBeenCalled();
	});

	it("clears the mark once the code is edited", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const module = await atRelayStep("verify");
		await module.submitRelayCode("123456");

		module.clearRelayCodeMismatch();

		expect(module.notificationSettings.codeMismatch).toBe(false);
	});

	it("does not mark a code the user already changed", async () => {
		const commit = Promise.withResolvers<RelayCommit>();
		push.commitRelay.mockReturnValue(commit.promise);
		const module = await atRelayStep("verify");

		const submitting = module.submitRelayCode("123456");
		module.clearRelayCodeMismatch();
		commit.resolve({ matched: false });
		await submitting;

		expect(module.notificationSettings.codeMismatch).toBe(false);
	});

	it("blocks the dialogs while it checks the code", async () => {
		const commit = Promise.withResolvers<RelayCommit>();
		push.commitRelay.mockReturnValue(commit.promise);
		const module = await atRelayStep("verify");

		const submitting = module.submitRelayCode("123456");

		expect(module.notificationSettings.committing).toBe(true);
		expect(module.notificationSettings.busy).toBe(true);
		await module.cancelRelaySetupFlow();
		await module.submitRelayCode("654321");
		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
		expect(push.commitRelay).toHaveBeenCalledOnce();
		commit.resolve({ matched: false });
		await submitting;
	});

	it("registers with Grindr, switches Fast Mode on and says fcm-relay is connected on the right code", async () => {
		const module = await atRelayStep("verify");
		recordOrder();

		await module.submitRelayCode("658591");

		expect(order).toEqual(["registerRelay", "enable"]);
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.relayStep).toBe("connected");
		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.committing).toBe(false);
		expect(module.notificationSettings.busy).toBe(false);
	});

	it("keeps the verification screen busy while Grindr registers the token", async () => {
		const registration = Promise.withResolvers<void>();
		push.registerRelay.mockReturnValue(registration.promise);
		const module = await atRelayStep("verify");

		const submitting = module.submitRelayCode("658591");
		await vi.waitFor(() => {
			expect(push.registerRelay).toHaveBeenCalledOnce();
		});

		expect(module.notificationSettings.relayStep).toBe("verify");
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.pendingSource).toBe("relay");
		expect(module.notificationSettings.committing).toBe(true);
		expect(module.notificationSettings.busy).toBe(true);
		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(push.setMode).not.toHaveBeenCalled();

		registration.resolve();
		await submitting;

		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.relayStep).toBe("connected");
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(module.notificationSettings.committing).toBe(false);
	});

	it("closes on Done after fcm-relay is connected and opens on the sources next time", async () => {
		const module = await atRelayStep("verify");
		await module.submitRelayCode("658591");

		module.finishRelaySetup();

		expect(module.notificationSettings.configDialogOpen).toBe(false);
		expect(module.notificationSettings.relayStep).toBe("connected");
		module.openFastModeConfig();
		expect(module.notificationSettings.relayStep).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
	});

	it("leaves the connected screen when the dialog closes another way", async () => {
		const module = await atRelayStep("verify");
		await module.submitRelayCode("658591");

		await module.closeFastModeConfig();

		expect(module.notificationSettings.configDialogOpen).toBe(false);
		expect(module.notificationSettings.relayStep).toBeNull();
	});

	it("ignores Done anywhere but the connected screen", async () => {
		const module = await atRelayStep("verify");

		module.finishRelaySetup();

		expect(module.notificationSettings.configDialogOpen).toBe(true);
		expect(module.notificationSettings.relayStep).toBe("verify");
	});

	it("lets the registration finish when the Configure dialog closes during it", async () => {
		const registration = Promise.withResolvers<void>();
		push.registerRelay.mockReturnValue(registration.promise);
		const module = await atRelayStep("verify");
		const submitting = module.submitRelayCode("658591");
		await vi.waitFor(() => {
			expect(push.registerRelay).toHaveBeenCalledOnce();
		});

		await module.closeFastModeConfig();
		registration.resolve();
		await submitting;

		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("fast");
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.relayStep).toBeNull();
		expect(module.notificationSettings.configDialogOpen).toBe(false);
	});

	it("retires the add-on token last when the add-on was delivering in Fast Mode", async () => {
		const module = await atVerifyFrom("addon");
		recordOrder();

		await module.submitRelayCode("658591");

		expect(order).toEqual([
			"registerRelay",
			"enable",
			"unregister",
			"delete",
		]);
		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
	});

	it("leaves the add-on token alone when Fast Mode was off", async () => {
		const module = await atRelayStep("verify", "addon");

		await module.submitRelayCode("658591");

		expect(account.unregisterPushToken).not.toHaveBeenCalled();
		expect(push.mintPushToken).not.toHaveBeenCalled();
	});

	it("keeps the pairing, falls back to Slow Mode and offers a retry when Grindr refuses the token", async () => {
		push.registerRelay.mockRejectedValueOnce(
			pushFailure("relayRegisterFailed"),
		);
		const module = await atRelayStep("verify");

		await module.submitRelayCode("658591");

		expect(push.setMode).toHaveBeenCalledWith("slow");
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.configDialogOpen).toBe(false);
		expect(module.notificationSettings.relayStep).toBeNull();
		expect(toastLabel()).toBe(failureLabels.enableFastMode);

		push.currentFastSource.mockResolvedValue("relay");
		toasts.showErrorToast.mock.lastCall?.[0].onRetry?.();
		await vi.waitFor(() => {
			expect(module.notificationSettings.mode).toBe("fast");
		});
		expect(push.registerRelay).toHaveBeenCalledTimes(2);
	});

	it("unregisters the add-on token when it falls back from Fast Mode with the add-on", async () => {
		push.registerRelay.mockRejectedValueOnce(new Error("offline"));
		const module = await atVerifyFrom("addon");

		await module.submitRelayCode("658591");

		expect(module.notificationSettings.mode).toBe("slow");
		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
	});

	it("unregisters the earlier pairing's fcm-relay tokens after it falls back to Slow Mode", async () => {
		const module = await atVerifyFrom("relay");
		recordOrder();
		push.registerRelay.mockRejectedValueOnce(new Error("offline"));

		await module.submitRelayCode("658591");

		expect(order).toEqual(["disable", "unregisterRelay"]);
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("unregisters the earlier pairing's fcm-relay tokens even when Fast Mode was off", async () => {
		push.registerRelay.mockRejectedValueOnce(new Error("offline"));
		const module = await atRelayStep("verify", "relay");

		await module.submitRelayCode("658591");

		expect(push.unregisterRelay).toHaveBeenCalledOnce();
	});

	it("unregisters nothing when there was no earlier fcm-relay pairing", async () => {
		push.registerRelay.mockRejectedValueOnce(new Error("offline"));
		const module = await atRelayStep("verify");

		await module.submitRelayCode("658591");

		expect(push.unregisterRelay).not.toHaveBeenCalled();
	});

	it("registers nothing when Retry comes after notifications went off", async () => {
		push.registerRelay.mockRejectedValueOnce(
			pushFailure("relayRegisterFailed"),
		);
		const module = await atRelayStep("verify");
		await module.submitRelayCode("658591");
		push.currentFastSource.mockResolvedValue("relay");
		preferences.stored.notificationsEnabled = false;

		toasts.showErrorToast.mock.lastCall?.[0].onRetry?.();
		await settled();

		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(push.setMode).not.toHaveBeenCalledWith("fast");
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("keeps the verification screen and toasts when the check itself fails", async () => {
		push.commitRelay.mockRejectedValue(new Error("ipc"));
		const module = await atRelayStep("verify");

		await module.submitRelayCode("123456");

		expect(module.notificationSettings.relayStep).toBe("verify");
		expect(module.notificationSettings.committing).toBe(false);
		expect(toastLabel()).toBe(failureLabels.relayCodeCheck);
	});

	it("closes the verification screen when the setup was lost before the check", async () => {
		push.commitRelay.mockRejectedValue(pushFailure("relaySetupLost"));
		const module = await atRelayStep("verify");

		await module.submitRelayCode("123456");

		expect(module.notificationSettings.relayStep).toBeNull();
		expect(module.notificationSettings.pendingSource).toBeNull();
		expect(toastLabel()).toBe(failureLabels.relaySetup);
	});
});

describe("an fcm-relay that stopped working", () => {
	it.each([
		{ paired: true, broken: true },
		{ paired: false, broken: false },
	])(
		"resets it, falls back to Slow Mode and offers to configure again (%o)",
		async (status) => {
			push.relayStatus.mockResolvedValue(status);
			push.currentFastSource.mockResolvedValue("relay");
			push.currentMode.mockResolvedValue("fast");
			recordOrder();
			const module = await freshModule();

			await module.reconcileNotifications();

			expect(order).toContain("unregisterRelay");
			expect(order.indexOf("unregisterRelay")).toBeLessThan(
				order.indexOf("forgetRelay"),
			);
			expect(module.notificationSettings.mode).toBe("slow");
			expect(module.notificationSettings.fastSource).toBeNull();
			const { label, options } = hintToast();
			expect(label).toBe(failureLabels.relayStopped);
			expect(options?.action?.label).toBe(
				failureLabels.relayStoppedAction,
			);
			options?.action?.onClick();
			expect(module.notificationSettings.configDialogOpen).toBe(true);
		},
	);

	async function stoppedRelayToast() {
		push.relayStatus.mockResolvedValue({ paired: true, broken: true });
		push.currentFastSource.mockResolvedValue("relay");
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();
		await module.reconcileNotifications();
		const { options } = hintToast();
		if (!options?.action) throw new Error("no Configure action");
		return { module, configure: options.action.onClick };
	}

	it("takes the Configure action to the notification settings from any other page", async () => {
		appState.page.url = new URL("http://localhost/chat/42");
		const { module, configure } = await stoppedRelayToast();

		configure();
		await settled();

		expect(navigation.goto).toHaveBeenCalledWith(
			"/settings/app/notifications",
		);
		expect(appState.page.url.pathname).toBe("/settings/app/notifications");
		expect(module.notificationSettings.configDialogOpen).toBe(true);
	});

	it("opens the Configure dialog in place on the notification settings", async () => {
		appState.page.url = new URL(
			"http://localhost/settings/app/notifications",
		);
		const { module, configure } = await stoppedRelayToast();

		configure();
		await settled();

		expect(navigation.goto).not.toHaveBeenCalled();
		expect(module.notificationSettings.configDialogOpen).toBe(true);
	});

	it("leaves the Configure dialog closed when the notification settings do not open", async () => {
		appState.page.url = new URL("http://localhost/chat/42");
		navigation.goto.mockRejectedValue(new Error("navigation aborted"));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { module, configure } = await stoppedRelayToast();

		configure();
		await settled();

		expect(module.notificationSettings.configDialogOpen).toBe(false);
	});

	it("leaves a working pairing alone", async () => {
		push.currentFastSource.mockResolvedValue("relay");
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.relayStatus).toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(push.addonReady).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("keeps Fast Mode and stays quiet when the pairing cannot be forgotten", async () => {
		push.relayStatus.mockResolvedValue({ paired: true, broken: true });
		push.forgetRelay.mockRejectedValue(new Error("ipc"));
		push.currentFastSource.mockResolvedValue("relay");
		push.currentMode.mockResolvedValue("fast");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.mode).toBe("fast");
		expect(sonner.toast.error).not.toHaveBeenCalled();
	});

	it("is not checked while notifications are off", async () => {
		preferences.stored.notificationsEnabled = false;
		push.currentFastSource.mockResolvedValue("relay");
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.relayStatus).not.toHaveBeenCalled();
	});
});

describe("reconciling the Fast Mode source", () => {
	it("switches to Slow Mode when Fast Mode has no source", async () => {
		push.currentFastSource.mockResolvedValue(null);
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.setMode).toHaveBeenCalledWith("slow");
		expect(module.notificationSettings.mode).toBe("slow");
		expect(push.addonReady).not.toHaveBeenCalled();
	});

	it("keeps the mode when Android cannot report the source", async () => {
		push.currentFastSource.mockRejectedValue(new Error("ipc"));
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("learns the source and whether Google Play services are present", async () => {
		push.currentFastSource.mockResolvedValue("relay");
		push.playServicesAvailable.mockResolvedValue(false);
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(module.notificationSettings.playServices).toBe(false);
	});

	it("leaves the Google Play services answer unknown until Android gives one", async () => {
		push.playServicesAvailable.mockRejectedValue(new Error("ipc"));
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(module.notificationSettings.playServices).toBeNull();
	});

	it("asks nothing about sources where Fast Mode has none", async () => {
		push.fastModeOptions.mockReturnValue([]);
		const module = await freshModule();

		await module.reconcileNotifications();

		expect(push.currentFastSource).not.toHaveBeenCalled();
		expect(push.playServicesAvailable).not.toHaveBeenCalled();
	});
});

describe("notifications turned back on with fcm-relay", () => {
	beforeEach(() => {
		preferences.stored.notificationsEnabled = false;
		push.currentFastSource.mockResolvedValue("relay");
		push.currentMode.mockResolvedValue("fast");
		push.inFastMode.mockResolvedValue(true);
	});

	it("registers the fcm-relay token instead of minting an add-on one", async () => {
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(toasts.showErrorToast).not.toHaveBeenCalled();
	});

	it("resets a pairing that belongs to another account", async () => {
		push.registerRelay.mockRejectedValue(pushFailure("relayUnpaired"));
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.forgetRelay).toHaveBeenCalled();
		expect(hintToast().label).toBe(failureLabels.relayStopped);
		expect(module.notificationSettings.enabled).toBe(true);
	});

	it("falls back to Slow Mode when Grindr refuses the token", async () => {
		push.registerRelay.mockRejectedValue(new Error("offline"));
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.setMode).toHaveBeenCalledWith("slow");
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(toastLabel()).toBe(failureLabels.enableFastMode);
	});
});

describe("leaving fcm-relay for Slow Mode or notifications off", () => {
	it("unregisters the fcm-relay token before Slow Mode and keeps the pairing", async () => {
		const module = await inFast("relay");
		recordOrder();

		await module.selectNotificationMode("slow");

		expect(order).toEqual(["unregisterRelay", "disable", "delete"]);
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(module.notificationSettings.fastSource).toBe("relay");
		expect(account.unregisterPushToken).not.toHaveBeenCalled();
	});

	it("unregisters the fcm-relay token when notifications go off", async () => {
		const module = await inFast("relay");
		recordOrder();

		await module.toggleNotifications(false);

		expect(order).toEqual(["disarm", "unregisterRelay", "delete"]);
		expect(push.mintPushToken).not.toHaveBeenCalled();
	});
});
