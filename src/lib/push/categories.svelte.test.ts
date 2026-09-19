import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
	pushAvailableHere: vi.fn(() => true),
	pushCategories: vi.fn<() => Promise<unknown[]>>(),
	setPushCategory:
		vi.fn<(category: string, enabled: boolean) => Promise<void>>(),
	openPushCategorySettings: vi.fn<(category: string) => Promise<void>>(),
}));
const account = vi.hoisted(() => ({
	getPushSettings:
		vi.fn<() => Promise<{ tapPushNotification?: boolean | null }>>(),
	setPushSettings:
		vi.fn<(settings: { tapPushNotification?: boolean }) => Promise<void>>(),
}));

vi.mock("./index", () => push);
vi.mock("$lib/api/settings/account", () => account);

const categories = [
	{ category: "messages", enabled: true, systemBlocked: false },
	{ category: "taps", enabled: true, systemBlocked: false },
];

async function freshModule() {
	vi.resetModules();
	return await import("./categories.svelte");
}

beforeEach(() => {
	vi.clearAllMocks();
	push.pushCategories.mockResolvedValue(
		categories.map((entry) => ({ ...entry })),
	);
	push.setPushCategory.mockResolvedValue(undefined);
	account.getPushSettings.mockResolvedValue({});
	account.setPushSettings.mockResolvedValue(undefined);
});

describe("notification categories", () => {
	it("adopts the account's tap setting so the background poll obeys it too", async () => {
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: false,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).toHaveBeenCalledWith("taps", false);
		expect(
			module.notificationCategories.list.find(
				(entry) => entry.category === "taps",
			)?.enabled,
		).toBe(false);
	});

	it("leaves the device alone when the account has no opinion on taps", async () => {
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: null,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).not.toHaveBeenCalled();
	});

	it("writes a tap change back to the account, since taps are shared", async () => {
		const module = await freshModule();

		await module.toggleNotificationCategory("taps", false);

		expect(push.setPushCategory).toHaveBeenCalledWith("taps", false);
		expect(account.setPushSettings).toHaveBeenCalledWith({
			tapPushNotification: false,
		});
	});

	it("keeps messages off the account, which has no message setting", async () => {
		const module = await freshModule();

		await module.toggleNotificationCategory("messages", false);

		expect(account.setPushSettings).not.toHaveBeenCalled();
	});
});
