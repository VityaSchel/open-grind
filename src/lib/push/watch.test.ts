import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushErrorReason, PushToken } from "./types";

type PushWatcher = (event: {
	deeplinkPending: boolean;
	tokenChanged: boolean;
}) => void;

const goto = vi.hoisted(() => vi.fn<(route: string) => Promise<void>>());
const signOut = vi.hoisted(() => ({
	onSignOut: vi.fn<(release: () => Promise<void>) => void>(),
}));
const account = vi.hoisted(() => ({
	registerPushToken: vi.fn<(token: PushToken) => Promise<void>>(),
}));
const teardown = vi.hoisted(() => ({
	forgetPushRegistration: vi.fn<() => Promise<void>>(),
}));
const notifications = vi.hoisted(() => ({
	reconcileNotifications: vi.fn<() => Promise<void>>(),
}));
const delivery = vi.hoisted(() => ({
	fallBackToSlow: vi.fn<(args: { error: unknown }) => Promise<void>>(),
}));
const categories = vi.hoisted(() => ({
	loadNotificationCategories: vi.fn<() => Promise<void>>(),
}));
const push = vi.hoisted(() => ({
	fcmServiceInstalled: vi.fn<() => Promise<boolean>>(),
	inFastMode: vi.fn<() => Promise<boolean>>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationsEnabled: vi.fn<() => Promise<boolean>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<(error: unknown) => PushErrorReason | null>(),
	takePushDeeplink: vi.fn<() => Promise<string | null>>(),
	watchPush: vi.fn<(watcher: PushWatcher) => Promise<void>>(),
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/api/sign-out", () => signOut);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("./teardown", () => teardown);
vi.mock("./notifications.svelte", () => notifications);
vi.mock("./delivery.svelte", () => delivery);
vi.mock("./categories.svelte", () => categories);
vi.mock("./index", () => push);

const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

async function freshModule() {
	vi.resetModules();
	return await import("./watch");
}

async function signOutRelease(): Promise<() => Promise<void>> {
	const module = await freshModule();
	await module.startPushWatch();
	const [release] = signOut.onSignOut.mock.lastCall ?? [];
	if (!release) throw new Error("no sign-out release registered");
	vi.clearAllMocks();
	return release;
}

beforeEach(() => {
	vi.clearAllMocks();
	goto.mockResolvedValue(undefined);
	push.pushAvailableHere.mockReturnValue(true);
	push.inFastMode.mockResolvedValue(true);
	push.fcmServiceInstalled.mockResolvedValue(true);
	push.mintPushToken.mockResolvedValue(token);
	push.notificationsEnabled.mockResolvedValue(true);
	push.takePushDeeplink.mockResolvedValue(null);
	push.watchPush.mockResolvedValue(undefined);
	push.pushErrorReason.mockReturnValue("failed");
	account.registerPushToken.mockResolvedValue(undefined);
	teardown.forgetPushRegistration.mockResolvedValue(undefined);
	delivery.fallBackToSlow.mockResolvedValue(undefined);
	notifications.reconcileNotifications.mockResolvedValue(undefined);
	categories.loadNotificationCategories.mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("watching push", () => {
	it("stays out of the way where push cannot work", async () => {
		push.pushAvailableHere.mockReturnValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.watchPush).not.toHaveBeenCalled();
		expect(signOut.onSignOut).not.toHaveBeenCalled();
		expect(categories.loadNotificationCategories).not.toHaveBeenCalled();
	});

	it("reconciles with Android before it touches the registration", async () => {
		const order: string[] = [];
		notifications.reconcileNotifications.mockImplementation(() => {
			order.push("reconcile");
			return Promise.resolve();
		});
		account.registerPushToken.mockImplementation(() => {
			order.push("register");
			return Promise.resolve();
		});
		const module = await freshModule();

		await module.startPushWatch();

		expect(order).toEqual(["reconcile", "register"]);
	});

	it("applies a tap setting changed on another device", async () => {
		const module = await freshModule();

		await module.startPushWatch();

		expect(categories.loadNotificationCategories).toHaveBeenCalled();
	});

	it("does not re-register a device whose owner turned notifications off", async () => {
		push.notificationsEnabled.mockResolvedValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it("opens a deeplink that arrived while the webview was dead", async () => {
		push.takePushDeeplink.mockResolvedValue(
			"grindr://conversation?id=1:2&senderId=2",
		);
		const module = await freshModule();

		await module.startPushWatch();

		expect(goto).toHaveBeenCalledWith("/chat/1%3A2");
	});

	it("keeps going when navigation to a deeplink fails", async () => {
		push.takePushDeeplink.mockResolvedValue(
			"grindr://conversation?id=1:2&senderId=2",
		);
		goto.mockRejectedValue(new Error("navigation aborted"));
		const module = await freshModule();

		await module.startPushWatch();

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
	});

	it("leaves the token alone in Slow mode", async () => {
		push.inFastMode.mockResolvedValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it("registers the rotated token when the add-on reports one", async () => {
		const module = await freshModule();
		await module.startPushWatch();
		account.registerPushToken.mockClear();

		const [watcher] = push.watchPush.mock.calls[0] ?? [];
		watcher?.({ deeplinkPending: false, tokenChanged: true });
		await vi.waitFor(() => {
			expect(account.registerPushToken).toHaveBeenCalledWith(token);
		});
	});
});

describe("losing Fast mode", () => {
	it.each([
		"addonUntrusted",
		"addonDisabled",
		"addonRefused",
		"untrustedCaller",
		"firebaseUnavailable",
	] as const)("falls back to Slow mode on %s", async (reason) => {
		const error = new Error(reason);
		account.registerPushToken.mockRejectedValue(error);
		push.pushErrorReason.mockReturnValue(reason);
		const module = await freshModule();

		await module.startPushWatch();

		expect(delivery.fallBackToSlow).toHaveBeenCalledWith({ error });
	});

	it("falls back to Slow mode once the add-on is uninstalled", async () => {
		account.registerPushToken.mockRejectedValue(new Error("unbound"));
		push.pushErrorReason.mockReturnValue("addonUnavailable");
		push.fcmServiceInstalled.mockResolvedValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(delivery.fallBackToSlow).toHaveBeenCalled();
	});

	it("keeps Fast mode through a dropped connection to an add-on that is still installed", async () => {
		account.registerPushToken.mockRejectedValue(new Error("unbound"));
		push.pushErrorReason.mockReturnValue("addonUnavailable");
		const module = await freshModule();

		await module.startPushWatch();

		expect(delivery.fallBackToSlow).not.toHaveBeenCalled();
	});

	it("keeps Fast mode through a failure the add-on did not cause", async () => {
		account.registerPushToken.mockRejectedValue(new Error("offline"));
		push.pushErrorReason.mockReturnValue(null);
		const module = await freshModule();

		await module.startPushWatch();

		expect(delivery.fallBackToSlow).not.toHaveBeenCalled();
	});

	it("falls back to Slow mode on any failure to register a rotated token", async () => {
		const module = await freshModule();
		await module.startPushWatch();
		const error = new Error("offline");
		account.registerPushToken.mockRejectedValue(error);
		push.pushErrorReason.mockReturnValue(null);

		const [watcher] = push.watchPush.mock.calls[0] ?? [];
		watcher?.({ deeplinkPending: false, tokenChanged: true });
		await vi.waitFor(() => {
			expect(delivery.fallBackToSlow).toHaveBeenCalledWith({ error });
		});
	});
});

describe("the sign-out release", () => {
	it("drops the registration while notifications are on", async () => {
		const release = await signOutRelease();

		await release();

		expect(teardown.forgetPushRegistration).toHaveBeenCalled();
	});

	it("does not mint a fresh token when notifications are off", async () => {
		const release = await signOutRelease();
		push.notificationsEnabled.mockResolvedValue(false);

		await release();

		expect(teardown.forgetPushRegistration).not.toHaveBeenCalled();
		expect(push.mintPushToken).not.toHaveBeenCalled();
	});

	it("is the same release however often the watch starts", async () => {
		const module = await freshModule();

		await module.startPushWatch();
		await module.startPushWatch();

		const [first, second] = signOut.onSignOut.mock.calls;
		expect(first?.[0]).toBe(second?.[0]);
	});
});
