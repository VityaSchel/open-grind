// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Os from "$lib/platform/os";
import type { PushToken } from "$lib/push/types";
import {
	account,
	addon,
	addonInstalled,
	checked,
	currentPlatform,
	disabled,
	inMode,
	installNow,
	opened,
	openExternalLink,
	push,
	resetNotificationsPage,
	showErrorToast,
	stored,
	token,
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
vi.mock("$lib/api/app-lifecycle.svelte", () => ({
	appLifecycle: { active: true },
}));

const NotificationsPage = (await import("./+page.svelte")).default;

const { reconcileNotifications } =
	await import("$lib/push/notifications.svelte");

beforeEach(resetNotificationsPage);

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe("the notifications page", () => {
	it("says notifications aren't supported off Android", () => {
		currentPlatform.mockReturnValue("linux");

		render(NotificationsPage);

		expect(
			screen.getByText(
				"Notifications aren't supported on this platform yet.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByRole("radiogroup")).toBeNull();
	});

	it("opens turned on in Slow mode with every editable control usable", async () => {
		const { master, delivery, fast, slow, taps } =
			await opened(NotificationsPage);

		expect(checked(master)).toBe("true");
		expect(delivery.hasAttribute("data-disabled")).toBe(false);
		expect(checked(slow)).toBe("true");
		expect(checked(fast)).toBe("false");
		for (const control of [fast, slow, taps])
			expect(disabled(control)).toBe(false);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("disables both delivery modes while notifications are off", async () => {
		stored.notificationsEnabled = false;
		const { master, delivery, fast, slow } =
			await opened(NotificationsPage);

		expect(checked(master)).toBe("false");
		expect(delivery.hasAttribute("data-disabled")).toBe(true);
		expect(disabled(fast)).toBe(true);
		expect(disabled(slow)).toBe(true);
	});

	it("shows no spinner while notifications turn off", async () => {
		const teardown = Promise.withResolvers<void>();
		push.setNotificationsEnabled.mockReturnValueOnce(teardown.promise);
		const { master, delivery } = await opened(NotificationsPage);

		await fireEvent.click(master);

		expect(delivery.hasAttribute("data-disabled")).toBe(true);
		expect(screen.queryByRole("status")).toBeNull();
		teardown.resolve();
		await waitFor(() => expect(stored.notificationsEnabled).toBe(false));
	});

	it("locks both delivery modes while notifications turn back on in Fast mode", async () => {
		stored.notificationsEnabled = false;
		inMode("fast");
		await reconcileNotifications();
		const minting = Promise.withResolvers<PushToken>();
		push.mintPushToken.mockReturnValueOnce(minting.promise);
		const { master, delivery } = await opened(NotificationsPage);

		await fireEvent.click(master);
		await waitFor(() => expect(stored.notificationsEnabled).toBe(true));

		expect(delivery.hasAttribute("data-disabled")).toBe(true);
		minting.resolve(token);
		await waitFor(() =>
			expect(delivery.hasAttribute("data-disabled")).toBe(false),
		);
		expect(account.registerPushToken).toHaveBeenCalledWith(token);
	});
});

describe("choosing Fast mode", () => {
	it("spins on Fast mode only while it registers, then selects it", async () => {
		const registration = Promise.withResolvers<void>();
		account.registerPushToken.mockReturnValueOnce(registration.promise);
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		expect(await within(fast).findByRole("status")).toBeTruthy();
		expect(within(slow).queryByRole("status")).toBeNull();
		expect(checked(slow)).toBe("true");
		registration.resolve();
		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("keeps spinning on Fast mode when the page is reopened mid-registration", async () => {
		const registration = Promise.withResolvers<void>();
		account.registerPushToken.mockReturnValueOnce(registration.promise);
		await fireEvent.click((await opened(NotificationsPage)).fast);
		await screen.findByRole("status");
		cleanup();

		const { fast } = await opened(NotificationsPage);

		expect(within(fast).getByRole("status")).toBeTruthy();
		registration.resolve();
		await waitFor(() => expect(checked(fast)).toBe("true"));
	});

	it("stays on Slow mode when registering fails", async () => {
		account.registerPushToken.mockRejectedValueOnce(new Error("offline"));
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({
					label: "Couldn't enable the fast mode for push notifications",
				}),
			),
		);
		expect(checked(slow)).toBe("true");
		expect(push.setMode).not.toHaveBeenCalled();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("shows no spinner while switching back to Slow mode", async () => {
		inMode("fast");
		await reconcileNotifications();
		const switching = Promise.withResolvers<void>();
		push.setMode.mockReturnValueOnce(switching.promise);
		const { delivery, fast, slow } = await opened(NotificationsPage);
		expect(checked(fast)).toBe("true");

		await fireEvent.click(slow);

		await waitFor(() =>
			expect(delivery.hasAttribute("data-disabled")).toBe(true),
		);
		expect(screen.queryByRole("status")).toBeNull();
		switching.resolve();
		await waitFor(() => expect(checked(slow)).toBe("true"));
		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
	});
});

describe("a missing FCM service", () => {
	beforeEach(() => {
		push.fcmServiceInstalled.mockResolvedValue(false);
	});

	it("asks before installing it, with no pending state and Slow mode still selected", async () => {
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);
		const dialog = await screen.findByRole("alertdialog", {
			name: "Install push notifications add-on",
		});

		expect(dialog.textContent.replace(/\s+/g, " ")).toContain(
			"To enable the fast mode, download and install FCM service add-on for Open Grind. It includes Google's proprietary Firebase library and needs Google Play services or microG, so it's not installed by default.",
		);
		expect(checked(slow)).toBe("true");
		expect(screen.queryByRole("status")).toBeNull();
		await fireEvent.click(
			within(dialog).getByRole("button", { name: "Continue" }),
		);
		expect(installNow).toHaveBeenCalledOnce();
		expect(openExternalLink).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(checked(slow)).toBe("true");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("switches to Fast mode when the install finishes after the page was left", async () => {
		await fireEvent.click((await opened(NotificationsPage)).fast);
		await fireEvent.click(
			await screen.findByRole("button", { name: "Continue" }),
		);
		cleanup();
		push.fcmServiceInstalled.mockResolvedValue(true);

		await addonInstalled();

		expect(checked((await opened(NotificationsPage)).fast)).toBe("true");
		expect(account.registerPushToken).toHaveBeenCalledOnce();
	});

	it.each([
		[
			"play",
			"https://opengrind.org/guides/notifications#installing-the-fcm-service",
		],
		["", "https://git.opengrind.org/open-grind/fcm-service/releases"],
	])(
		"opens %j's guide in the browser when this build can't install add-ons: %s",
		async (store, href) => {
			vi.stubEnv("OPEN_GRIND_STORE", store);
			addon.addonInstallerAvailable.mockReturnValue(false);
			const { fast, slow } = await opened(NotificationsPage);

			await fireEvent.click(fast);
			const dialog = await screen.findByRole("alertdialog", {
				name: "Install push notifications add-on",
			});

			await fireEvent.click(
				within(dialog).getByRole("button", { name: "Continue" }),
			);
			expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(href);
			expect(installNow).not.toHaveBeenCalled();
			await waitFor(() =>
				expect(screen.queryByRole("alertdialog")).toBeNull(),
			);
			expect(checked(slow)).toBe("true");
		},
	);
});
