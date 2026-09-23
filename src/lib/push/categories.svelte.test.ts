import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushCategory } from "./types";

const push = vi.hoisted(() => ({
	pushAvailableHere: vi.fn(() => true),
	pushCategories: vi.fn<() => Promise<PushCategory[]>>(),
	setPushCategory:
		vi.fn<
			(args: { category: string; enabled: boolean }) => Promise<void>
		>(),
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

const open: PushCategory[] = [
	{ category: "messages", enabled: true, systemBlocked: false },
	{ category: "taps", enabled: true, systemBlocked: false },
];

function deviceReports(categories: PushCategory[]): void {
	push.pushCategories.mockImplementation(() =>
		Promise.resolve(categories.map((entry) => ({ ...entry }))),
	);
}

async function freshModule() {
	vi.resetModules();
	return await import("./categories.svelte");
}

async function loaded() {
	const module = await freshModule();
	await module.loadNotificationCategories();
	vi.clearAllMocks();
	return module;
}

beforeEach(() => {
	vi.clearAllMocks();
	deviceReports(open);
	push.setPushCategory.mockResolvedValue(undefined);
	push.openPushCategorySettings.mockResolvedValue(undefined);
	account.getPushSettings.mockResolvedValue({});
	account.setPushSettings.mockResolvedValue(undefined);
});

describe("loading notification categories", () => {
	it("adopts the account's tap setting so the background poll obeys it too", async () => {
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: false,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).toHaveBeenCalledWith({
			category: "taps",
			enabled: false,
		});
		expect(
			module.notificationCategories.list.find(
				(entry) => entry.category === "taps",
			)?.enabled,
		).toBe(false);
	});

	it("shows what the device still has when it cannot adopt the account's tap setting", async () => {
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: false,
		});
		push.setPushCategory.mockRejectedValue(new Error("ipc"));
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(
			module.notificationCategories.list.find(
				(entry) => entry.category === "taps",
			)?.enabled,
		).toBe(true);
	});

	it("leaves the device alone when the account has no opinion on taps", async () => {
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: null,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).not.toHaveBeenCalled();
	});

	it("keeps the last list when the device cannot be read", async () => {
		const module = await loaded();
		push.pushCategories.mockRejectedValue(new Error("ipc"));

		await module.loadNotificationCategories();

		expect(module.notificationCategories.list).toHaveLength(2);
	});
});

describe("toggling a notification category", () => {
	it("writes a tap change back to the account, since taps are shared", async () => {
		const module = await loaded();

		await module.toggleNotificationCategory({
			category: "taps",
			enabled: false,
		});

		expect(push.setPushCategory).toHaveBeenCalledWith({
			category: "taps",
			enabled: false,
		});
		expect(account.setPushSettings).toHaveBeenCalledWith({
			tapPushNotification: false,
		});
	});

	it("sends New messages to Android settings when it is turned off, since Android owns it", async () => {
		const module = await loaded();

		await module.toggleNotificationCategory({
			category: "messages",
			enabled: false,
		});

		expect(push.openPushCategorySettings).toHaveBeenCalledWith("messages");
		expect(push.setPushCategory).not.toHaveBeenCalled();
		expect(account.setPushSettings).not.toHaveBeenCalled();
	});

	it.each(["messages", "taps"] as const)(
		"sends a %s category Android blocks to its Android settings instead of changing it",
		async (category) => {
			deviceReports(
				open.map((entry) =>
					entry.category === category
						? { ...entry, systemBlocked: true }
						: entry,
				),
			);
			const module = await loaded();

			await module.toggleNotificationCategory({
				category,
				enabled: true,
			});

			expect(push.openPushCategorySettings).toHaveBeenCalledWith(
				category,
			);
			expect(push.setPushCategory).not.toHaveBeenCalled();
			expect(account.setPushSettings).not.toHaveBeenCalled();
		},
	);
});

describe("coming back from Android settings", () => {
	const tapsOff = (systemBlocked: boolean): PushCategory[] =>
		open.map((entry) =>
			entry.category === "taps"
				? { ...entry, enabled: false, systemBlocked }
				: entry,
		);

	function deviceSaves(): void {
		push.setPushCategory.mockImplementation(({ category, enabled }) => {
			deviceReports(
				tapsOff(false).map((entry) =>
					entry.category === category ? { ...entry, enabled } : entry,
				),
			);
			return Promise.resolve();
		});
	}

	async function sentToSettings() {
		deviceReports(tapsOff(true));
		const module = await loaded();
		await module.toggleNotificationCategory({
			category: "taps",
			enabled: true,
		});
		expect(push.openPushCategorySettings).toHaveBeenCalledWith("taps");
		return module;
	}

	it("turns Received taps on when the user allowed them there", async () => {
		const module = await sentToSettings();
		deviceReports(tapsOff(false));
		deviceSaves();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).toHaveBeenCalledWith({
			category: "taps",
			enabled: true,
		});
		expect(account.setPushSettings).toHaveBeenCalledWith({
			tapPushNotification: true,
		});
		expect(
			module.notificationCategories.list.find(
				(entry) => entry.category === "taps",
			)?.enabled,
		).toBe(true);
	});

	it("stays off when the user came back without allowing them, and forgets the trip", async () => {
		const module = await sentToSettings();
		await module.loadNotificationCategories();
		deviceReports(tapsOff(false));

		await module.loadNotificationCategories();

		expect(push.setPushCategory).not.toHaveBeenCalled();
		expect(account.setPushSettings).not.toHaveBeenCalled();
	});

	it("leaves a category Android allowed without Open Grind alone", async () => {
		deviceReports(tapsOff(true));
		const module = await loaded();
		deviceReports(tapsOff(false));

		await module.loadNotificationCategories();

		expect(push.setPushCategory).not.toHaveBeenCalled();
	});
});
