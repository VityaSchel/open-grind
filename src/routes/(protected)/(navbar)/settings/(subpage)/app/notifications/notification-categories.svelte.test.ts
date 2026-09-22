// @vitest-environment jsdom

import { cleanup, fireEvent, waitFor } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Os from "$lib/platform/os";
import {
	account,
	appLifecycle,
	categories,
	checked,
	disabled,
	opened,
	push,
	resetNotificationsPage,
	stored,
} from "./notifications-page-test-helpers.svelte";

vi.mock(
	"$lib/push/index",
	async () => (await import("./notifications-page-test-helpers.svelte")).push,
);
vi.mock(
	"$lib/api/settings/account",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).account,
);
vi.mock(
	"$lib/app-data/preferences.svelte",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).preferences,
);
vi.mock(
	"$lib/updates/addon.svelte",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).addon,
);
vi.mock("$lib/api/error-toast", async () => ({
	showErrorToast: (await import("./notifications-page-test-helpers.svelte"))
		.showErrorToast,
}));
vi.mock("$lib/platform/link-opener", async () => ({
	openExternalLink: (await import("./notifications-page-test-helpers.svelte"))
		.openExternalLink,
}));
vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof Os>()),
	currentPlatform: (await import("./notifications-page-test-helpers.svelte"))
		.currentPlatform,
}));
vi.mock("$lib/api/app-lifecycle.svelte", async () => ({
	appLifecycle: (await import("./notifications-page-test-helpers.svelte"))
		.appLifecycle,
}));

const NotificationsPage = (await import("./+page.svelte")).default;

beforeEach(resetNotificationsPage);

afterEach(cleanup);

describe("the notification categories", () => {
	it("titles both switches without a description and shows them on", async () => {
		const { messages, taps } = await opened(NotificationsPage);

		expect(messages.closest("label")?.textContent.trim()).toBe(
			"New messages",
		);
		expect(taps.closest("label")?.textContent.trim()).toBe("Received taps");
		for (const control of [messages, taps])
			expect(checked(control)).toBe("true");
		expect(disabled(taps)).toBe(false);
	});

	it("opens Android's settings when New messages is turned off and stays on", async () => {
		const { messages } = await opened(NotificationsPage);
		expect(disabled(messages)).toBe(false);

		await fireEvent.click(messages);

		await waitFor(() =>
			expect(push.openPushCategorySettings).toHaveBeenCalledWith(
				"messages",
			),
		);
		expect(push.setPushCategory).not.toHaveBeenCalled();
		expect(checked(messages)).toBe("true");
	});

	it("opens Android's settings when a blocked New messages is turned on", async () => {
		push.pushCategories.mockResolvedValue(
			categories({ systemBlocked: true }),
		);
		const { messages } = await opened(NotificationsPage);
		expect(checked(messages)).toBe("false");
		expect(disabled(messages)).toBe(false);

		await fireEvent.click(messages);

		await waitFor(() =>
			expect(push.openPushCategorySettings).toHaveBeenCalledWith(
				"messages",
			),
		);
		expect(push.setPushCategory).not.toHaveBeenCalled();
		expect(checked(messages)).toBe("false");
	});

	it("opens Android's settings and saves nothing when a blocked category is turned on", async () => {
		push.pushCategories.mockResolvedValue(
			categories({}, { systemBlocked: true }),
		);
		const { messages, taps } = await opened(NotificationsPage);
		expect(checked(taps)).toBe("false");

		await fireEvent.click(taps);

		await waitFor(() =>
			expect(push.openPushCategorySettings).toHaveBeenCalledWith("taps"),
		);
		expect(push.setPushCategory).not.toHaveBeenCalled();
		expect(account.setPushSettings).not.toHaveBeenCalled();
		expect(push.setNotificationsEnabled).not.toHaveBeenCalled();
		expect(checked(taps)).toBe("false");
		expect(checked(messages)).toBe("true");
		expect(stored.notificationsEnabled).toBe(true);
	});

	it("disables Received taps while it saves", async () => {
		const saving = Promise.withResolvers<void>();
		push.setPushCategory.mockReturnValueOnce(saving.promise);
		const { taps } = await opened(NotificationsPage);

		await fireEvent.click(taps);

		expect(disabled(taps)).toBe(true);
		saving.resolve();
		await waitFor(() => expect(disabled(taps)).toBe(false));
		expect(account.setPushSettings).toHaveBeenCalledWith({
			tapPushNotification: false,
		});
	});

	it("disables every category while notifications are off", async () => {
		stored.notificationsEnabled = false;
		push.pushCategories.mockResolvedValue(
			categories({ systemBlocked: true }),
		);
		const { messages, taps } = await opened(NotificationsPage);

		for (const control of [messages, taps])
			expect(disabled(control)).toBe(true);
	});

	it("reloads the categories only when the app resumes", async () => {
		const { taps } = await opened(NotificationsPage);
		expect(push.pushCategories).toHaveBeenCalledOnce();

		push.pushCategories.mockResolvedValue(
			categories({}, { systemBlocked: true }),
		);
		appLifecycle.active = false;
		flushSync();
		expect(push.pushCategories).toHaveBeenCalledOnce();
		appLifecycle.active = true;
		flushSync();

		await waitFor(() => expect(checked(taps)).toBe("false"));
		expect(push.pushCategories).toHaveBeenCalledTimes(2);
	});
});
