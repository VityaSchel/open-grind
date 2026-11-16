import { render, screen, within } from "@testing-library/svelte";
import { SvelteSet } from "svelte/reactivity";
import { vi } from "vitest";

import type * as AccountApi from "#lib/api/settings/account.ts";
import type * as Os from "#lib/platform/os.ts";
import type * as PushApi from "#lib/push/index.ts";
import type {
	FastSource,
	PushCategory,
	PushErrorReason,
	PushToken,
} from "#lib/push/types.ts";
import type NotificationsPage from "./+page.svelte";

type InstallListener = () => Promise<void>;

const settled = () => Promise.resolve();

export class PushFailure extends Error {
	constructor(readonly reason: PushErrorReason) {
		super(reason);
	}
}

export const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

export const push = {
	addonReady: vi.fn(settled),
	awaitRelay: vi.fn(settled),
	beginRelaySetup: vi.fn(settled),
	cancelRelaySetup: vi.fn(settled),
	commitRelay: vi.fn<typeof PushApi.commitRelay>(),
	currentFastSource: vi.fn<typeof PushApi.currentFastSource>(),
	currentMode: vi.fn<typeof PushApi.currentMode>(),
	deletePushToken: vi.fn(settled),
	fastModeOptions: (): FastSource[] =>
		currentPlatform() === "android" ? ["addon", "relay"] : [],
	fcmServiceInstalled: vi.fn<typeof PushApi.fcmServiceInstalled>(),
	forgetRelay: vi.fn(settled),
	inFastMode: vi.fn<typeof PushApi.inFastMode>(),
	mintPushToken: vi.fn<typeof PushApi.mintPushToken>(),
	notificationPermission: vi.fn<typeof PushApi.notificationPermission>(),
	openNotificationSettings: vi.fn(settled),
	openPushCategorySettings: vi.fn(settled),
	playServicesAvailable: vi.fn<typeof PushApi.playServicesAvailable>(),
	pushAvailableHere: () =>
		["android", "linux", "macos", "windows"].includes(currentPlatform()),
	pushCategories: vi.fn<typeof PushApi.pushCategories>(),
	pushErrorReason: (error: unknown): PushErrorReason | null =>
		error instanceof PushFailure ? error.reason : null,
	registerRelay: vi.fn(settled),
	relayStatus: vi.fn<typeof PushApi.relayStatus>(),
	requestNotificationPermission:
		vi.fn<typeof PushApi.requestNotificationPermission>(),
	saveRelayConfig: vi.fn<typeof PushApi.saveRelayConfig>(),
	setFastSource: vi.fn(settled),
	setMode: vi.fn(settled),
	setNotificationsEnabled: vi.fn(settled),
	setPushCategory: vi.fn(settled),
	shareRelayConfig: vi.fn(settled),
	unregisterRelay: vi.fn(settled),
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
		return () => {
			installListeners.delete(listener);
		};
	},
};

export async function addonInstalled(): Promise<void> {
	await Promise.all([...installListeners].map((listener) => listener()));
}

export const installedFromFdroid = vi.fn(() => false);
export const currentPlatform = vi.fn<typeof Os.currentPlatform>();
export const showErrorToast = vi.fn();
export const openExternalLink = vi.fn();
export const hintToast = vi.fn();

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

async function resetNotificationState(): Promise<void> {
	const { notificationState } =
		await import("#lib/push/notification-state.svelte.ts");
	Object.assign(notificationState, {
		phase: "idle",
		permissionPending: false,
		addonDialog: null,
		fastSource: null,
		playServices: null,
		configDialogOpen: false,
		pendingSource: null,
		relayStep: null,
		committing: false,
		codeMismatch: false,
		addonAttempt: null,
	});
}

export async function resetNotificationsPage(): Promise<void> {
	vi.resetAllMocks();
	stored.notificationsEnabled = true;
	appLifecycle.active = true;
	installListeners.clear();
	currentPlatform.mockReturnValue("android");
	installedFromFdroid.mockReturnValue(false);
	addon.addonInstallerAvailable.mockReturnValue(true);
	inMode("slow");
	push.currentFastSource.mockResolvedValue("addon");
	push.playServicesAvailable.mockResolvedValue(true);
	push.relayStatus.mockResolvedValue({ paired: false, broken: false });
	push.commitRelay.mockResolvedValue({ matched: true });
	push.saveRelayConfig.mockResolvedValue(true);
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
		await import("#lib/push/categories.svelte.ts");
	const { reconcileNotifications } =
		await import("#lib/push/notifications.svelte.ts");
	notificationCategories.list = [];
	await resetNotificationState();
	await reconcileNotifications();
	vi.clearAllMocks();
}

export async function withFastSource(source: FastSource | null): Promise<void> {
	push.currentFastSource.mockResolvedValue(source);
	const { reconcileNotifications } =
		await import("#lib/push/notifications.svelte.ts");
	await reconcileNotifications();
}

export async function opened(page: typeof NotificationsPage) {
	render(page);
	await screen.findByRole("switch", { name: "Received taps" });
	return {
		master: screen.getByRole("switch", { name: "Enable notifications" }),
		delivery: screen.getByRole("radiogroup", { name: "Delivery mode" }),
		fast: screen.getByRole("radio", { name: /^Fast Mode/ }),
		slow: screen.getByRole("radio", { name: /^Slow Mode/ }),
		configure: configureField(),
		messages: screen.getByRole("switch", { name: "New messages" }),
		taps: screen.getByRole("switch", { name: "Received taps" }),
	};
}

export function configureField(): HTMLElement {
	const field = document.querySelector<HTMLElement>(
		'[data-slot="fast-mode-config-field"]',
	);
	if (field === null) throw new Error("The Configure field isn’t shown");
	return within(field).getByRole("button");
}

export function configDialog(): Promise<HTMLElement> {
	return screen.findByRole("alertdialog", { name: "Configure Fast Mode" });
}

export function relayAlert(): Promise<HTMLElement> {
	return screen.findByRole("alertdialog", { name: "fcm-relay config" });
}

export function sourceOptions(dialog: HTMLElement) {
	return {
		addon: within(dialog).getByRole("radio", {
			name: /^FCM service add-on/,
		}),
		relay: within(dialog).getByRole("radio", {
			name: /^fcm-relay \+ UnifiedPush/,
		}),
	};
}

export function checked(control: HTMLElement): string | null {
	return control.getAttribute("aria-checked");
}

export function disabled(control: HTMLElement): boolean {
	return control.matches(":disabled");
}
