import { render, screen } from "@testing-library/svelte";
import { SvelteSet } from "svelte/reactivity";
import { vi } from "vitest";

import type * as AccountApi from "$lib/api/settings/account";
import type * as Os from "$lib/platform/os";
import type * as PushApi from "$lib/push/index";
import type { PushCategory, PushToken } from "$lib/push/types";
import type NotificationsPage from "./+page.svelte";

type InstallListener = () => Promise<void>;

const settled = () => Promise.resolve();

export const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

export const push = {
	addonReady: vi.fn(settled),
	currentMode: vi.fn<typeof PushApi.currentMode>(),
	deletePushToken: vi.fn(settled),
	fcmServiceInstalled: vi.fn<typeof PushApi.fcmServiceInstalled>(),
	inFastMode: vi.fn<typeof PushApi.inFastMode>(),
	mintPushToken: vi.fn<typeof PushApi.mintPushToken>(),
	notificationPermission: vi.fn<typeof PushApi.notificationPermission>(),
	openNotificationSettings: vi.fn(settled),
	openPushCategorySettings: vi.fn(settled),
	pushAvailableHere: () => true,
	pushCategories: vi.fn<typeof PushApi.pushCategories>(),
	pushErrorReason: () => null,
	requestNotificationPermission:
		vi.fn<typeof PushApi.requestNotificationPermission>(),
	setMode: vi.fn(settled),
	setNotificationsEnabled: vi.fn(settled),
	setPushCategory: vi.fn(settled),
};

export const account = {
	getPushSettings: vi.fn<typeof AccountApi.getPushSettings>(),
	registerPushToken: vi.fn(settled),
	setPushSettings: vi.fn(settled),
	unregisterPushToken: vi.fn(settled),
};

export const stored = $state({ notificationsEnabled: true });

export const appLifecycle = $state({ active: true });

export const preferences = {
	getPreferences: () => Promise.resolve({ ...stored }),
	preferencesLoaded: () => true,
	preferencesSnapshot: () => stored,
	setPreferences: (next: { notificationsEnabled?: boolean }) => {
		Object.assign(stored, next);
		return Promise.resolve();
	},
};

const installListeners = new SvelteSet<InstallListener>();

export const installNow = vi.fn(settled);

export const addon = {
	addonFlow: () => ({ installNow }),
	addonInstallerAvailable: vi.fn(() => true),
	onAddonInstalled: ({ listener }: { listener: InstallListener }) => {
		installListeners.add(listener);
	},
};

export async function addonInstalled(): Promise<void> {
	await Promise.all([...installListeners].map((listener) => listener()));
}

export const currentPlatform = vi.fn<typeof Os.currentPlatform>();
export const showErrorToast = vi.fn();
export const openExternalLink = vi.fn();

export function categories(
	...overrides: Partial<PushCategory>[]
): PushCategory[] {
	return (["messages", "taps"] as const).map((category, index) => ({
		category,
		enabled: true,
		systemBlocked: false,
		...overrides[index],
	}));
}

export function inMode(mode: "slow" | "fast"): void {
	push.currentMode.mockResolvedValue(mode);
	push.inFastMode.mockResolvedValue(mode === "fast");
}

export async function resetNotificationsPage(): Promise<void> {
	vi.resetAllMocks();
	stored.notificationsEnabled = true;
	appLifecycle.active = true;
	installListeners.clear();
	currentPlatform.mockReturnValue("android");
	addon.addonInstallerAvailable.mockReturnValue(true);
	inMode("slow");
	push.fcmServiceInstalled.mockResolvedValue(true);
	push.notificationPermission.mockResolvedValue({
		granted: true,
		state: "granted",
	});
	push.requestNotificationPermission.mockResolvedValue({
		granted: true,
		state: "granted",
	});
	push.mintPushToken.mockResolvedValue(token);
	push.pushCategories.mockResolvedValue(categories());
	account.getPushSettings.mockResolvedValue({ tapPushNotification: true });
	const { notificationCategories } =
		await import("$lib/push/categories.svelte");
	const { dismissAddonDialog } = await import("$lib/push/delivery.svelte");
	const { reconcileNotifications } =
		await import("$lib/push/notifications.svelte");
	notificationCategories.list = [];
	await reconcileNotifications();
	dismissAddonDialog();
	vi.clearAllMocks();
}

export async function opened(page: typeof NotificationsPage) {
	render(page);
	await screen.findByRole("switch", { name: "Received taps" });
	return {
		master: screen.getByRole("switch", { name: "Enable notifications" }),
		delivery: screen.getByRole("radiogroup", { name: "Delivery mode" }),
		fast: screen.getByRole("radio", { name: /^Fast mode/ }),
		slow: screen.getByRole("radio", { name: /^Slow mode/ }),
		messages: screen.getByRole("switch", { name: "New messages" }),
		taps: screen.getByRole("switch", { name: "Received taps" }),
	};
}

export function checked(control: HTMLElement): string | null {
	return control.getAttribute("aria-checked");
}

export function disabled(control: HTMLElement): boolean {
	return control.hasAttribute("disabled");
}
