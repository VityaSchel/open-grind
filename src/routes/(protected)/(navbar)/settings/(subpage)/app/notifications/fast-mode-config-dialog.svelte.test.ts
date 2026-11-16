// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Os from "#lib/platform/os.ts";
import type * as Capability from "#lib/updates/capability.svelte.ts";
import {
	account,
	addonInstalled,
	addon as addonUpdates,
	checked,
	configDialog,
	configureField,
	disabled,
	inMode,
	installNow,
	opened,
	openExternalLink,
	push,
	resetNotificationsPage,
	sourceOptions,
	stored,
	token,
	withFastSource,
} from "./notifications-page-test-helpers.svelte";

vi.mock(
	"#lib/push/index.ts",
	async () => (await import("./notifications-page-test-helpers.svelte")).push,
);
vi.mock(
	"#lib/api/settings/account.ts",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).account,
);
vi.mock(
	"#lib/app-data/preferences.svelte.ts",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).preferences,
);
vi.mock(
	"#lib/updates/addon.svelte.ts",
	async () =>
		(await import("./notifications-page-test-helpers.svelte")).addon,
);
vi.mock("#lib/updates/capability.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<typeof Capability>()),
	installedFromFdroid: (
		await import("./notifications-page-test-helpers.svelte")
	).installedFromFdroid,
}));
vi.mock("#lib/api/error-toast.ts", async () => ({
	showErrorToast: (await import("./notifications-page-test-helpers.svelte"))
		.showErrorToast,
}));
vi.mock("#lib/platform/link-opener.ts", async () => ({
	openExternalLink: (await import("./notifications-page-test-helpers.svelte"))
		.openExternalLink,
}));
vi.mock("#lib/platform/os.ts", async (importOriginal) => {
	const { currentPlatform } =
		await import("./notifications-page-test-helpers.svelte");
	return {
		...(await importOriginal<typeof Os>()),
		currentPlatform,
		isAndroidPlatform: () => currentPlatform() === "android",
	};
});
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({
	appLifecycle: { active: true },
}));

const NotificationsPage = (await import("./+page.svelte")).default;

const ADDON_DESCRIPTION =
	"Includes Google’s proprietary Firebase library and needs Google Play services or microG.";
const RELAY_DESCRIPTION =
	"For advanced users. Requires a UnifiedPush distributor app, such as ntfy, and a self-hosted fcm-relay.";

beforeEach(resetNotificationsPage);

afterEach(cleanup);

async function openConfig(): Promise<HTMLElement> {
	const { configure } = await opened(NotificationsPage);
	await fireEvent.click(configure);
	return await focused(await configDialog());
}

async function focused(dialog: HTMLElement): Promise<HTMLElement> {
	await waitFor(() =>
		expect(dialog.contains(document.activeElement)).toBe(true),
	);
	return dialog;
}

describe("the Configure field", () => {
	it.each([
		[null, "Configure"],
		["addon", "FCM service"],
		["relay", "fcm-relay"],
	] as const)(
		"names the %s source as “%s”, outside the Fast Mode radio",
		async (source, label) => {
			await withFastSource(source);
			const { fast, configure } = await opened(NotificationsPage);

			expect(configure.textContent.trim()).toBe(label);
			expect(fast.contains(configure)).toBe(false);
			expect(disabled(configure)).toBe(false);
		},
	);

	it("is disabled along with the delivery modes while notifications are off", async () => {
		stored.notificationsEnabled = false;
		const { configure, fast } = await opened(NotificationsPage);

		expect(disabled(fast)).toBe(true);
		expect(disabled(configure)).toBe(true);
	});

	it("is disabled while Fast Mode registers", async () => {
		const registration = Promise.withResolvers<void>();
		account.registerPushToken.mockReturnValueOnce(registration.promise);
		const { configure, fast } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		await waitFor(() => expect(disabled(configure)).toBe(true));
		registration.resolve();
		await waitFor(() => expect(disabled(configure)).toBe(false));
	});

	it("opens the Configure dialog when Fast Mode is tapped before any source is set up", async () => {
		await withFastSource(null);
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		const dialog = await configDialog();
		const { addon, relay } = sourceOptions(dialog);
		expect(checked(addon)).toBe("false");
		expect(checked(relay)).toBe("false");
		expect(checked(slow)).toBe("true");
		expect(push.setMode).not.toHaveBeenCalled();
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});
});

describe("the Configure dialog", () => {
	it("selects only the configured source", async () => {
		await withFastSource("relay");

		const { addon, relay } = sourceOptions(await openConfig());

		expect(checked(addon)).toBe("false");
		expect(checked(relay)).toBe("true");
	});

	it("recommends the add-on and describes both sources outside their radios", async () => {
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		expect(within(addon).getByText("Recommended")).toBeTruthy();
		expect(within(relay).queryByText("Recommended")).toBeNull();
		expect(
			within(dialog).getByRole("radio", {
				name: /^FCM service add-on/,
				description: ADDON_DESCRIPTION,
			}),
		).toBe(addon);
		expect(
			within(dialog).getByRole("radio", {
				name: /^fcm-relay \+ UnifiedPush/,
				description: (text) =>
					text.replace(/\s+(?=[,.])/g, "") === RELAY_DESCRIPTION,
			}),
		).toBe(relay);
		for (const link of within(dialog).getAllByRole("link"))
			expect(relay.contains(link) || addon.contains(link)).toBe(false);
	});

	it.each([
		[
			"UnifiedPush distributor app",
			"https://unifiedpush.org/users/distributors/",
		],
		["ntfy", "https://unifiedpush.org/users/distributors/ntfy/"],
		[
			"self-hosted fcm-relay",
			"https://git.opengrind.org/open-grind/fcm-relay",
		],
	])(
		"opens %s in the browser without choosing fcm-relay",
		async (name, href) => {
			const dialog = await openConfig();

			await fireEvent.click(within(dialog).getByRole("link", { name }));

			expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(href);
			expect(push.beginRelaySetup).not.toHaveBeenCalled();
		},
	);

	it("marks the add-on Not Available and disables it without Google Play services", async () => {
		push.playServicesAvailable.mockResolvedValue(false);
		await withFastSource(null);

		const { addon, relay } = sourceOptions(await openConfig());

		expect(within(addon).getByText("Not Available")).toBeTruthy();
		expect(within(addon).queryByText("Recommended")).toBeNull();
		expect(disabled(addon)).toBe(true);
		expect(disabled(relay)).toBe(false);
	});

	it("shows no badge on the add-on while Google Play services are unknown", async () => {
		push.playServicesAvailable.mockRejectedValue(new Error("unanswered"));
		const { notificationState } =
			await import("#lib/push/notification-state.svelte.ts");
		notificationState.playServices = null;
		await withFastSource("addon");

		const { addon } = sourceOptions(await openConfig());

		expect(within(addon).queryByText("Recommended")).toBeNull();
		expect(within(addon).queryByText("Not Available")).toBeNull();
		expect(disabled(addon)).toBe(false);
	});

	it("stays open on Escape and closes with Close", async () => {
		const dialog = await openConfig();

		await fireEvent.keyDown(dialog, { key: "Escape" });
		expect(screen.getByRole("alertdialog")).toBe(dialog);

		await fireEvent.click(
			within(dialog).getByRole("button", { name: "Close" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
	});

	it("hands focus back to the Configure field when it closes", async () => {
		const dialog = await openConfig();

		await fireEvent.click(
			within(dialog).getByRole("button", { name: "Close" }),
		);

		await waitFor(() =>
			expect(document.activeElement).toBe(configureField()),
		);
	});
});

describe("choosing the FCM service add-on", () => {
	beforeEach(() => withFastSource(null));

	it("adopts an installed add-on, keeps the dialog open and relabels the field", async () => {
		const dialog = await openConfig();
		const { addon } = sourceOptions(dialog);

		await fireEvent.click(addon);

		await waitFor(() => expect(checked(addon)).toBe("true"));
		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(push.setFastSource).toHaveBeenCalledWith("addon");
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(screen.getByRole("alertdialog")).toBe(dialog);
		expect(configureField().textContent.trim()).toBe("FCM service");
	});

	it("disables both sources and spins on the add-on while it connects", async () => {
		const connecting = Promise.withResolvers<void>();
		push.addonReady.mockReturnValueOnce(connecting.promise);
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		await fireEvent.click(addon);

		await waitFor(() => expect(disabled(relay)).toBe(true));
		expect(disabled(addon)).toBe(true);
		expect(addon.getAttribute("aria-busy")).toBe("true");
		expect(
			within(addon).getByRole("status", { hidden: true }),
		).toBeTruthy();
		connecting.resolve();
		await waitFor(() => expect(disabled(relay)).toBe(false));
	});

	describe("when it isn’t installed", () => {
		beforeEach(() => {
			push.fcmServiceInstalled.mockResolvedValue(false);
		});

		async function offerInstall() {
			const dialog = await openConfig();
			const { addon } = sourceOptions(dialog);
			await fireEvent.click(addon);
			const prompt = await focused(
				await screen.findByRole("alertdialog", {
					name: "Install push notifications add-on",
				}),
			);
			return { dialog, addon, prompt };
		}

		it("asks to install it over the dialog without selecting it", async () => {
			const { addon, prompt } = await offerInstall();

			expect(
				screen.getAllByRole("alertdialog", { hidden: true }),
			).toHaveLength(2);
			expect(checked(addon)).toBe("false");
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			expect(installNow).toHaveBeenCalledOnce();
			expect(checked(addon)).toBe("false");
			expect(push.setFastSource).not.toHaveBeenCalled();
		});

		it("selects it and closes the dialog once the install it started finishes", async () => {
			const { prompt } = await offerInstall();
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			push.fcmServiceInstalled.mockResolvedValue(true);

			await addonInstalled();

			await waitFor(() =>
				expect(screen.queryByRole("alertdialog")).toBeNull(),
			);
			expect(push.setFastSource).toHaveBeenCalledWith("addon");
			expect(
				checked(screen.getByRole("radio", { name: /^Fast Mode/ })),
			).toBe("true");
			expect(configureField().textContent.trim()).toBe("FCM service");
		});

		it("keeps nothing selected after the install prompt is cancelled and focuses the add-on", async () => {
			const { dialog, addon, prompt } = await offerInstall();

			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Cancel" }),
			);

			await waitFor(() => expect(document.activeElement).toBe(addon));
			expect(screen.getByRole("alertdialog")).toBe(dialog);
			expect(checked(addon)).toBe("false");
			expect(installNow).not.toHaveBeenCalled();
		});

		it("ignores an install that finishes after the dialog was closed", async () => {
			const { dialog, prompt } = await offerInstall();
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			await fireEvent.click(
				within(dialog).getByRole("button", { name: "Close" }),
			);
			push.fcmServiceInstalled.mockResolvedValue(true);

			await addonInstalled();

			expect(push.setFastSource).not.toHaveBeenCalled();
			expect(configureField().textContent.trim()).toBe("Configure");
		});
	});
});

describe("choosing the FCM service add-on when it’s the source in Slow Mode", () => {
	const ADDON_PROMPT = "Install push notifications add-on";

	beforeEach(() => withFastSource("addon"));

	async function openConfigFromSlowMode() {
		const { configure, fast } = await opened(NotificationsPage);
		await fireEvent.click(configure);
		const dialog = await focused(await configDialog());
		return { dialog, fast, ...sourceOptions(dialog) };
	}

	it("turns Fast Mode back on with the installed add-on", async () => {
		const { dialog, fast, addon } = await openConfigFromSlowMode();

		await fireEvent.click(addon);

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(checked(addon)).toBe("true");
		expect(screen.getByRole("alertdialog")).toBe(dialog);
		expect(configureField().textContent.trim()).toBe("FCM service");
	});

	it("offers the install over the dialog when the add-on is gone", async () => {
		push.fcmServiceInstalled.mockResolvedValue(false);
		const { fast, addon } = await openConfigFromSlowMode();

		await fireEvent.click(addon);

		expect(
			await screen.findByRole("alertdialog", { name: ADDON_PROMPT }),
		).toBeTruthy();
		expect(push.setMode).not.toHaveBeenCalled();
		expect(checked(fast)).toBe("false");
	});

	it("turns Fast Mode on when the add-on is chosen again after a manual install", async () => {
		push.fcmServiceInstalled.mockResolvedValue(false);
		addonUpdates.addonInstallerAvailable.mockReturnValue(false);
		const { fast, addon } = await openConfigFromSlowMode();
		await fireEvent.click(addon);
		const prompt = await focused(
			await screen.findByRole("alertdialog", { name: ADDON_PROMPT }),
		);
		await fireEvent.click(
			within(prompt).getByRole("button", { name: "Continue" }),
		);
		expect(openExternalLink).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(
				screen.queryByRole("alertdialog", { name: ADDON_PROMPT }),
			).toBeNull(),
		);
		push.fcmServiceInstalled.mockResolvedValue(true);

		await fireEvent.click(addon);

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(installNow).not.toHaveBeenCalled();
	});
});

describe("Fast Mode with a source set up", () => {
	it("re-registers fcm-relay instead of opening the dialog", async () => {
		push.relayStatus.mockResolvedValue({ paired: true, broken: false });
		await withFastSource("relay");
		const { fast } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("opens the dialog again when fcm-relay stopped working", async () => {
		inMode("slow");
		push.relayStatus.mockResolvedValue({ paired: true, broken: true });
		await withFastSource("relay");
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		const { relay } = sourceOptions(await configDialog());
		expect(push.forgetRelay).toHaveBeenCalledOnce();
		expect(checked(relay)).toBe("false");
		expect(checked(slow)).toBe("true");
		expect(configureField().textContent.trim()).toBe("Configure");
	});
});
