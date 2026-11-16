import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	account,
	nativeMode,
	order,
	preferences,
	push,
	recordOrder,
	resetPushMocks,
	token,
} from "./push-test-helpers";

vi.mock("./index", () => push);
vi.mock("#lib/api/settings/account.ts", () => account);
vi.mock("#lib/app-data/preferences.svelte.ts", () => preferences);

beforeEach(() => {
	resetPushMocks();
	nativeMode("fast");
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function freshModule() {
	vi.resetModules();
	return await import("./teardown");
}

describe("forgetting the Grindr registration", () => {
	it("unregisters the add-on token when the add-on delivers Fast Mode", async () => {
		const module = await freshModule();

		await module.forgetPushRegistration();

		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
		expect(push.unregisterRelay).not.toHaveBeenCalled();
	});

	it("asks Android to unregister the fcm-relay token when fcm-relay delivers Fast Mode", async () => {
		push.currentFastSource.mockResolvedValue("relay");
		const module = await freshModule();

		await module.forgetPushRegistration();

		expect(push.unregisterRelay).toHaveBeenCalledOnce();
		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(push.forgetRelay).not.toHaveBeenCalled();
	});

	it("carries on when the fcm-relay token cannot be unregistered", async () => {
		push.currentFastSource.mockResolvedValue("relay");
		push.unregisterRelay.mockRejectedValue(new Error("offline"));
		const module = await freshModule();

		await expect(module.forgetPushRegistration()).resolves.toBeUndefined();
	});

	it("leaves the add-on token alone in Slow Mode", async () => {
		nativeMode("slow");
		const module = await freshModule();

		await module.forgetPushRegistration();

		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(account.unregisterPushToken).not.toHaveBeenCalled();
	});

	it("unregisters the fcm-relay token in Slow Mode too", async () => {
		nativeMode("slow");
		push.currentFastSource.mockResolvedValue("relay");
		const module = await freshModule();

		await module.forgetPushRegistration();

		expect(push.unregisterRelay).toHaveBeenCalledOnce();
		expect(push.mintPushToken).not.toHaveBeenCalled();
	});

	it("unregisters a leftover fcm-relay token when notifications go off in Slow Mode", async () => {
		nativeMode("slow");
		push.currentFastSource.mockResolvedValue("relay");
		recordOrder();
		const module = await freshModule();

		await module.stopNotifications();

		expect(order).toEqual(["disarm", "unregisterRelay", "delete"]);
	});

	it("touches nothing when Android cannot say which source is set", async () => {
		push.currentFastSource.mockRejectedValue(new Error("ipc"));
		const module = await freshModule();

		await module.forgetPushRegistration();

		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(push.unregisterRelay).not.toHaveBeenCalled();
	});

	it("stops notifications before it unregisters the fcm-relay token", async () => {
		push.currentFastSource.mockResolvedValue("relay");
		recordOrder();
		const module = await freshModule();

		await module.stopNotifications();

		expect(order).toEqual(["disarm", "unregisterRelay", "delete"]);
		expect(preferences.stored.notificationsEnabled).toBe(false);
	});
});
