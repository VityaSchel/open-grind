// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import type * as Os from "#lib/platform/os.ts";
import type * as Capability from "#lib/updates/capability.svelte.ts";
import {
	account,
	addonInstalled,
	addon as addonUpdates,
	checked,
	configSheet,
	configureField,
	disabled,
	inMode,
	installNow,
	opened,
	openExternalLink,
	optionAction,
	optionStatus,
	push,
	querySetupButton,
	resetNotificationsPage,
	setupButton,
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
const CONTROLS =
	'a, button, input, select, textarea, [role="button"], [role="radio"], [role="checkbox"], [tabindex]';

beforeEach(resetNotificationsPage);

afterEach(cleanup);

async function openConfig(): Promise<HTMLElement> {
	const { configure } = await opened(NotificationsPage);
	await fireEvent.click(configure);
	return await focused(await configSheet());
}

async function focused(dialog: HTMLElement): Promise<HTMLElement> {
	await waitFor(() =>
		expect(dialog.contains(document.activeElement)).toBe(true),
	);
	return dialog;
}

function settledFrames(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

function openDialogs(): HTMLElement[] {
	return [
		...screen.queryAllByRole("dialog"),
		...screen.queryAllByRole("alertdialog"),
	];
}

async function withSource({
	source,
	mode,
}: {
	source: "addon" | "relay" | null;
	mode: "slow" | "fast";
}): Promise<void> {
	inMode(mode);
	push.relayStatus.mockResolvedValue({
		paired: source === "relay",
		broken: false,
	});
	await withFastSource(source);
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

	it("opens the Configure sheet when Fast Mode is tapped before any source is set up", async () => {
		await withFastSource(null);
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		const dialog = await configSheet();
		const { addon, relay } = sourceOptions(dialog);
		expect(optionAction(addon)).toBe("Set up");
		expect(optionAction(relay)).toBe("Set up");
		expect(checked(slow)).toBe("true");
		expect(push.setMode).not.toHaveBeenCalled();
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});
});

describe("the Configure sheet", () => {
	it("is an auto-height drawer titled Configure Fast Mode with a drag handle and no Close button", async () => {
		const dialog = await openConfig();

		expect(dialog.dataset.slot).toBe("drawer-content");
		expect(dialog.classList).not.toContain("h-(--screen-safe)");
		expect(
			dialog.querySelector('[data-slot="drawer-handle"]'),
		).not.toBeNull();
		expect(
			within(dialog)
				.getByRole("heading", { level: 2 })
				.textContent.trim(),
		).toBe("Configure Fast Mode");
		expect(
			within(dialog).queryByRole("button", { name: "Close" }),
		).toBeNull();
		expect(dialog.querySelector('[data-slot="page-indicator"]')).toBeNull();
	});

	it("pads the source list from the drawer’s bottom edge like its side gutters, with no footer under it", async () => {
		const dialog = await openConfig();

		const body = dialog.querySelector<HTMLElement>(
			'[data-slot="drawer-body"]',
		);
		expect(body?.classList).toContain("px-4");
		expect(body?.classList).toContain("pb-4");
		expect(body?.contains(dialog.querySelector("ul"))).toBe(true);
		expect(dialog.querySelector('[data-slot="drawer-footer"]')).toBeNull();
	});

	it.each([
		["nothing", null, "slow", "Set up", "Set up"],
		["the add-on", "addon", "slow", "Set up", "Set up"],
		["the add-on", "addon", "fast", "Selected", "Set up"],
		["fcm-relay", "relay", "slow", "Set up", "Modify"],
		["fcm-relay", "relay", "fast", "Set up", "Modify"],
	] as const)(
		"labels each source’s action with %s set up in %s mode",
		async (_name, source, mode, addonAction, relayAction) => {
			await withSource({ source, mode });

			const { addon, relay } = sourceOptions(await openConfig());

			expect(optionAction(addon)).toBe(addonAction);
			expect(optionAction(relay)).toBe(relayAction);
			expect(within(addon).queryByText("Not available")).toBeNull();
		},
	);

	it("shows Modify on the configured fcm-relay in the accent style with its chevron, and it starts a fresh setup", async () => {
		await withSource({ source: "relay", mode: "fast" });
		const dialog = await openConfig();
		const { relay, addon } = sourceOptions(dialog);

		const modify = setupButton(relay);
		expect(modify.textContent.trim()).toBe("Modify");
		expect(modify.classList).toContain("bg-primary");
		expect(setupButton(addon).classList).toContain("bg-secondary");
		expect(
			modify.querySelector('svg[data-icon="inline-end"]'),
		).not.toBeNull();

		await fireEvent.click(modify);

		await waitFor(() =>
			expect(push.beginRelaySetup).toHaveBeenCalledOnce(),
		);
	});

	it("says Selected in the add-on’s place while it delivers Fast Mode, as an accent label that can’t be pressed or focused", async () => {
		await withSource({ source: "addon", mode: "fast" });
		const dialog = await openConfig();
		const { addon } = sourceOptions(dialog);

		const status = optionStatus(addon);
		expect(status?.textContent.trim()).toBe("Selected");
		expect(status?.localName).toBe("span");
		expect(status?.hasAttribute("tabindex")).toBe(false);
		expect(status?.hasAttribute("inert")).toBe(false);
		expect(status?.hasAttribute("aria-hidden")).toBe(false);
		expect(status?.hasAttribute("aria-disabled")).toBe(false);
		expect(status?.classList).toContain("bg-primary");
		expect(status?.classList).toContain("pointer-events-none");
		expect(
			status?.querySelector('svg[data-icon="inline-end"]'),
		).not.toBeNull();
		expect(querySetupButton(addon)).toBeNull();

		await fireEvent.click(status ?? document.body);
		await settledFrames();

		expect(push.fcmServiceInstalled).not.toHaveBeenCalled();
		expect(openDialogs()).toEqual([dialog]);
	});

	it("recommends the add-on and describes each source on its Set up button", async () => {
		await withFastSource(null);
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		expect(within(addon).getByText("Recommended")).toBeTruthy();
		expect(within(relay).queryByText("Recommended")).toBeNull();
		const describedAs = (text: string) => (description: string) =>
			description.replace(/\s+(?=[,.])/g, "").replace(/\s+/g, " ") ===
			text;
		expect(
			within(addon).getByRole("button", {
				name: "Set up",
				description: describedAs(
					`FCM service add-on Recommended ${ADDON_DESCRIPTION}`,
				),
			}),
		).toBe(setupButton(addon));
		expect(
			within(relay).getByRole("button", {
				name: "Set up",
				description: describedAs(
					`fcm-relay + UnifiedPush ${RELAY_DESCRIPTION}`,
				),
			}),
		).toBe(setupButton(relay));
	});

	it("nests no control in another and leaves the options themselves inert", async () => {
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		const controls = [addon, relay].flatMap((option) => [
			...option.querySelectorAll<HTMLElement>(CONTROLS),
		]);
		expect(controls.map((control) => control.localName)).toEqual([
			"button",
			"a",
			"a",
			"a",
			"button",
		]);
		for (const control of controls)
			expect(control.querySelector(CONTROLS)).toBeNull();
		for (const option of [addon, relay])
			expect(option.closest(CONTROLS)).toBe(dialog);
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
		"opens %s in the browser without setting up fcm-relay",
		async (name, href) => {
			const dialog = await openConfig();
			const { relay } = sourceOptions(dialog);

			await fireEvent.click(within(relay).getByRole("link", { name }));
			await settledFrames();

			expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(href);
			expect(push.beginRelaySetup).not.toHaveBeenCalled();
			expect(setupButton(relay).getAttribute("aria-busy")).toBe("false");
			expect(await configSheet()).toBe(dialog);
		},
	);

	it("sets nothing up when an option’s title, description or blank space is tapped", async () => {
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		for (const option of [addon, relay]) {
			await fireEvent.click(within(option).getByRole("heading"));
			await fireEvent.click(
				option.querySelector<HTMLElement>(
					'[data-slot="item-description"]',
				) ?? document.body,
			);
			await fireEvent.click(option);
		}
		await settledFrames();

		expect(push.fcmServiceInstalled).not.toHaveBeenCalled();
		expect(push.beginRelaySetup).not.toHaveBeenCalled();
		expect(openDialogs()).toEqual([dialog]);
	});

	it("grays out the add-on without Google Play services and says Not available in its button’s place, in the neutral style with no icon", async () => {
		push.playServicesAvailable.mockResolvedValue(false);
		await withFastSource(null);

		const { addon, relay } = sourceOptions(await openConfig());

		const status = optionStatus(addon);
		expect(status?.textContent.trim()).toBe("Not available");
		expect(status?.localName).toBe("span");
		expect(status?.classList).toContain("bg-secondary");
		expect(status?.classList).toContain("pointer-events-none");
		expect(status?.querySelector("svg")).toBeNull();
		expect(querySetupButton(addon)).toBeNull();
		expect(status?.hasAttribute("aria-hidden")).toBe(false);
		expect(within(addon).getByText("Recommended")).toBeTruthy();
		expect(within(addon).getByText(ADDON_DESCRIPTION)).toBeTruthy();
		expect(addon.hasAttribute("data-disabled")).toBe(true);
		expect(addon.classList).toContain("data-disabled:opacity-60");
		expect(relay.hasAttribute("data-disabled")).toBe(false);
		expect(disabled(setupButton(relay))).toBe(false);
	});

	it("shows no badge on the add-on while Google Play services are unknown", async () => {
		push.playServicesAvailable.mockRejectedValue(new Error("unanswered"));
		const { notificationState } =
			await import("#lib/push/notification-state.svelte.ts");
		notificationState.playServices = null;
		await withFastSource(null);

		const { addon } = sourceOptions(await openConfig());

		expect(within(addon).queryByText("Recommended")).toBeNull();
		expect(optionStatus(addon)).toBeNull();
		expect(disabled(setupButton(addon))).toBe(false);
	});

	it.each([
		["nothing", null, "slow", "addon"],
		["fcm-relay", "relay", "fast", "addon"],
		["the add-on", "addon", "fast", "relay"],
	] as const)(
		"focuses the first Set up button when it opens with %s set up",
		async (_name, source, mode, first) => {
			await withSource({ source, mode });

			const options = sourceOptions(await openConfig());

			expect(document.activeElement).toBe(setupButton(options[first]));
		},
	);

	it("focuses fcm-relay’s button when it opens with the add-on unavailable", async () => {
		push.playServicesAvailable.mockResolvedValue(false);
		await withFastSource(null);

		const { relay } = sourceOptions(await openConfig());

		expect(document.activeElement).toBe(setupButton(relay));
	});

	it.each([
		[
			"Escape",
			async (dialog: HTMLElement) => {
				await fireEvent.keyDown(dialog, { key: "Escape" });
			},
		],
		[
			"Back",
			() => {
				runBackGestureHandlers();
				return Promise.resolve();
			},
		],
	] as const)("closes on %s", async (_gesture, dismiss) => {
		const dialog = await openConfig();
		dialog.style.transform = "none";

		await dismiss(dialog);

		await waitFor(() => expect(openDialogs()).toEqual([]));
		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
	});

	it("hands focus back to the Configure field when it closes", async () => {
		await openConfig();

		runBackGestureHandlers();

		await waitFor(() =>
			expect(document.activeElement).toBe(configureField()),
		);
	});
});

describe("choosing the FCM service add-on", () => {
	beforeEach(() => withFastSource(null));

	it("adopts an installed add-on, keeps the sheet open, drops its button and relabels the field", async () => {
		const dialog = await openConfig();
		const { addon } = sourceOptions(dialog);

		await fireEvent.click(setupButton(addon));

		await waitFor(() => expect(optionAction(addon)).toBe("Selected"));
		expect(querySetupButton(addon)).toBeNull();
		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(push.setFastSource).toHaveBeenCalledWith("addon");
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(openDialogs()).toEqual([dialog]);
		expect(configureField().textContent.trim()).toBe("FCM service");
	});

	it("hands focus from the add-on’s button to fcm-relay’s once Selected takes its place", async () => {
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);
		expect(document.activeElement).toBe(setupButton(addon));

		await fireEvent.click(setupButton(addon));

		await waitFor(() => expect(querySetupButton(addon)).toBeNull());
		await waitFor(() =>
			expect(document.activeElement).toBe(setupButton(relay)),
		);
		await settledFrames();
		expect(document.activeElement).toBe(setupButton(relay));
		expect(openDialogs()).toEqual([dialog]);
	});

	it("disables both buttons and spins on the add-on’s while it connects", async () => {
		const connecting = Promise.withResolvers<void>();
		push.addonReady.mockReturnValueOnce(connecting.promise);
		const dialog = await openConfig();
		const { addon, relay } = sourceOptions(dialog);

		await fireEvent.click(setupButton(addon));

		await waitFor(() => expect(disabled(setupButton(relay))).toBe(true));
		expect(disabled(setupButton(addon))).toBe(true);
		expect(setupButton(addon).getAttribute("aria-busy")).toBe("true");
		expect(setupButton(relay).getAttribute("aria-busy")).toBe("false");
		expect(
			within(setupButton(addon)).getByRole("status", { hidden: true }),
		).toBeTruthy();
		expect(
			within(setupButton(relay)).queryByRole("status", { hidden: true }),
		).toBeNull();
		connecting.resolve();
		await waitFor(() => expect(querySetupButton(addon)).toBeNull());
		expect(disabled(setupButton(relay))).toBe(false);
	});

	describe("when it isn’t installed", () => {
		beforeEach(() => {
			push.fcmServiceInstalled.mockResolvedValue(false);
		});

		async function offerInstall() {
			const dialog = await openConfig();
			const { addon } = sourceOptions(dialog);
			await fireEvent.click(setupButton(addon));
			const prompt = await focused(
				await screen.findByRole("alertdialog", {
					name: "Install push notifications add-on",
				}),
			);
			return { dialog, addon, prompt };
		}

		it("asks to install it over the sheet without selecting it", async () => {
			const { dialog, addon, prompt } = await offerInstall();

			expect(screen.getAllByRole("alertdialog")).toEqual([prompt]);
			expect(
				screen.getAllByRole("dialog", {
					hidden: true,
					name: "Configure Fast Mode",
				}),
			).toEqual([dialog]);
			expect(optionAction(addon)).toBe("Set up");
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			expect(installNow).toHaveBeenCalledOnce();
			expect(optionAction(addon)).toBe("Set up");
			expect(push.setFastSource).not.toHaveBeenCalled();
		});

		it("selects it and closes the sheet once the install it started finishes", async () => {
			const { prompt } = await offerInstall();
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			push.fcmServiceInstalled.mockResolvedValue(true);

			await addonInstalled();

			await waitFor(() => expect(openDialogs()).toEqual([]));
			expect(push.setFastSource).toHaveBeenCalledWith("addon");
			expect(
				checked(screen.getByRole("radio", { name: /^Fast Mode/ })),
			).toBe("true");
			expect(configureField().textContent.trim()).toBe("FCM service");
		});

		it("keeps nothing selected after the install prompt is cancelled and focuses the add-on’s button", async () => {
			const { dialog, addon, prompt } = await offerInstall();

			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Cancel" }),
			);

			await waitFor(() =>
				expect(document.activeElement).toBe(setupButton(addon)),
			);
			expect(openDialogs()).toEqual([dialog]);
			expect(optionAction(addon)).toBe("Set up");
			expect(installNow).not.toHaveBeenCalled();
		});

		it("ignores an install that finishes after the sheet was closed", async () => {
			const { dialog, prompt } = await offerInstall();
			await fireEvent.click(
				within(prompt).getByRole("button", { name: "Continue" }),
			);
			await waitFor(() => expect(openDialogs()).toEqual([dialog]));
			runBackGestureHandlers();
			await waitFor(() => expect(openDialogs()).toEqual([]));
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
		const dialog = await focused(await configSheet());
		return { dialog, fast, ...sourceOptions(dialog) };
	}

	it("turns Fast Mode back on with the installed add-on through Set up", async () => {
		const { dialog, fast, addon } = await openConfigFromSlowMode();
		expect(optionAction(addon)).toBe("Set up");

		await fireEvent.click(setupButton(addon));

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(optionAction(addon)).toBe("Selected");
		expect(querySetupButton(addon)).toBeNull();
		expect(openDialogs()).toEqual([dialog]);
		expect(configureField().textContent.trim()).toBe("FCM service");
	});

	it("offers the install over the sheet when the add-on is gone", async () => {
		push.fcmServiceInstalled.mockResolvedValue(false);
		const { fast, addon } = await openConfigFromSlowMode();

		await fireEvent.click(setupButton(addon));

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
		await fireEvent.click(setupButton(addon));
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

		await fireEvent.click(setupButton(addon));

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(installNow).not.toHaveBeenCalled();
	});
});
