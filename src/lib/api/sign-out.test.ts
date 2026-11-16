import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

const { goto, callMethod, caches, preferences, markers, push } = vi.hoisted(
	() => ({
		goto: vi.fn(() => Promise.resolve()),
		callMethod: vi.fn(() => Promise.resolve(null)),
		caches: { clearAccountCaches: vi.fn() },
		preferences: {
			clearAccountPreferences: vi.fn(() => Promise.resolve()),
		},
		markers: { clearStored: vi.fn() },
		push: {
			pushAvailableHere: vi.fn(() => true),
			fastModeOptions: vi.fn((): string[] => ["addon", "relay"]),
			fcmServiceInstalled: vi.fn(() => Promise.resolve(false)),
			deletePushToken: vi.fn(() => Promise.resolve()),
			dropRelayOrphans: vi.fn(() => Promise.resolve()),
			forgetRelay: vi.fn(() => Promise.resolve()),
			setNotificationsEnabled: vi.fn(() => Promise.resolve()),
		},
	}),
);

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("#lib/api/methods.ts", () => ({ callMethod }));
vi.mock("#lib/api/account-caches.ts", () => caches);
vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);
vi.mock("#lib/chat/inbox-last-viewed.svelte.ts", () => ({
	inboxLastViewed: markers,
}));
vi.mock("#lib/interest/taps-last-viewed.ts", () => ({
	tapsLastViewed: markers,
}));
vi.mock("#lib/push/index.ts", () => push);

async function freshModule() {
	vi.resetModules();
	return await import("./sign-out");
}

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	push.pushAvailableHere.mockReturnValue(true);
	push.fastModeOptions.mockReturnValue(["addon", "relay"]);
	push.fcmServiceInstalled.mockResolvedValue(false);
	callMethod.mockImplementation(() => {
		order.push("sign_out");
		return Promise.resolve(null);
	});
	push.deletePushToken.mockImplementation(() => {
		order.push("delete");
		return Promise.resolve();
	});
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("signing out", () => {
	it("lets registered releases run while the session is still usable", async () => {
		const module = await freshModule();
		module.onSignOut(() => {
			order.push("release");
			return Promise.resolve();
		});

		await module.signOut();

		expect(order).toEqual(["release", "sign_out"]);
	});

	it("signs out anyway when a release fails", async () => {
		const module = await freshModule();
		module.onSignOut(() => Promise.reject(new Error("no add-on")));

		await module.signOut();

		expect(callMethod).toHaveBeenCalledWith("sign_out");
		expect(goto).toHaveBeenCalledWith("/auth/sign-in");
	});

	it("signs out anyway when a release throws before it returns a promise", async () => {
		const module = await freshModule();
		module.onSignOut(() => {
			throw new Error("sync");
		});

		await module.signOut();

		expect(callMethod).toHaveBeenCalledWith("sign_out");
	});

	it("forgets the registration before it deletes the firebase token", async () => {
		push.fcmServiceInstalled.mockResolvedValue(true);
		const module = await freshModule();
		module.onSignOut(() => {
			order.push("forget");
			return Promise.resolve();
		});

		await module.signOut();

		expect(order).toEqual(["forget", "sign_out", "delete"]);
	});

	it("clears the account even when every push call fails", async () => {
		push.fcmServiceInstalled.mockResolvedValue(true);
		push.setNotificationsEnabled.mockRejectedValueOnce(new Error("ipc"));
		push.deletePushToken.mockRejectedValueOnce(new Error("ipc"));
		const module = await freshModule();

		await module.clearAccountState();

		expect(preferences.clearAccountPreferences).toHaveBeenCalled();
	});

	it("runs every release once, however often it was registered", async () => {
		const module = await freshModule();
		const release = vi.fn(() => Promise.resolve());
		module.onSignOut(release);
		module.onSignOut(release);

		await module.signOut();

		expect(release).toHaveBeenCalledOnce();
	});

	it("stops notifications for this account even in slow mode", async () => {
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});

	it("drops the firebase token wherever the add-on is installed, in either mode", async () => {
		const module = await freshModule();

		await module.clearAccountState();
		expect(push.deletePushToken).not.toHaveBeenCalled();

		push.fcmServiceInstalled.mockResolvedValue(true);
		await module.clearAccountState();
		expect(push.deletePushToken).toHaveBeenCalled();
	});

	it("forgets the fcm-relay pairing whatever the mode or add-on", async () => {
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.forgetRelay).toHaveBeenCalledOnce();
	});

	it("drops the leftover fcm-relay tokens after it forgets the pairing", async () => {
		push.forgetRelay.mockImplementation(() => {
			order.push("forgetRelay");
			return Promise.resolve();
		});
		push.dropRelayOrphans.mockImplementation(() => {
			order.push("dropRelayOrphans");
			return Promise.resolve();
		});
		const module = await freshModule();

		await module.clearAccountState();

		expect(order).toEqual(["forgetRelay", "dropRelayOrphans"]);
	});

	it("drops the leftover fcm-relay tokens even when the pairing cannot be forgotten", async () => {
		push.forgetRelay.mockRejectedValueOnce(new Error("ipc"));
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.dropRelayOrphans).toHaveBeenCalledOnce();
	});

	it("clears the account even when the leftover fcm-relay tokens cannot be dropped", async () => {
		push.dropRelayOrphans.mockRejectedValueOnce(new Error("ipc"));
		push.fcmServiceInstalled.mockResolvedValue(true);
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.deletePushToken).toHaveBeenCalled();
		expect(preferences.clearAccountPreferences).toHaveBeenCalled();
	});

	it("clears the account even when the fcm-relay pairing cannot be forgotten", async () => {
		push.forgetRelay.mockRejectedValueOnce(new Error("ipc"));
		push.fcmServiceInstalled.mockResolvedValue(true);
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.deletePushToken).toHaveBeenCalled();
		expect(preferences.clearAccountPreferences).toHaveBeenCalled();
	});

	it("leaves fcm-relay alone where Fast Mode cannot use it", async () => {
		push.fastModeOptions.mockReturnValue([]);
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(push.dropRelayOrphans).not.toHaveBeenCalled();
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});

	it("makes no push calls where push is unavailable", async () => {
		push.pushAvailableHere.mockReturnValue(false);
		push.fcmServiceInstalled.mockResolvedValue(true);
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.setNotificationsEnabled).not.toHaveBeenCalled();
		expect(push.fcmServiceInstalled).not.toHaveBeenCalled();
		expect(push.deletePushToken).not.toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(push.dropRelayOrphans).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();
		expect(preferences.clearAccountPreferences).toHaveBeenCalled();
	});

	it("leaves this device's push alone when signing out of the demo", async () => {
		vi.stubGlobal("__DEMO__", true);
		push.fcmServiceInstalled.mockResolvedValue(true);
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.setNotificationsEnabled).not.toHaveBeenCalled();
		expect(push.deletePushToken).not.toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
		expect(push.dropRelayOrphans).not.toHaveBeenCalled();
		expect(preferences.clearAccountPreferences).toHaveBeenCalled();
	});
});
