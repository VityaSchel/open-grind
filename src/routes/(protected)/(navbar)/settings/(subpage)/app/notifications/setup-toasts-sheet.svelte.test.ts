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
	configSheet,
	hintToast,
	opened,
	push,
	PushFailure,
	relaySheet,
	resetNotificationsPage,
	setupButton,
	showErrorToast,
	sourceOptions,
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
vi.mock("svelte-sonner", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte-sonner")>()),
	toast: {
		error: (await import("./notifications-page-test-helpers.svelte"))
			.hintToast,
		success: vi.fn(),
		dismiss: vi.fn(),
	},
}));
const NotificationsPage = (await import("./+page.svelte")).default;

const PIN_INPUT_SYNC_MS = 60;

let connection: PromiseWithResolvers<void>;
let toaster: HTMLElement;

beforeEach(async () => {
	document.elementFromPoint = () => null;
	await resetNotificationsPage();
	await withFastSource(null);
	connection = Promise.withResolvers<void>();
	push.awaitRelay.mockReturnValue(connection.promise);
	const host = document.createElement("div");
	host.dataset.slot = "toast-host";
	toaster = document.createElement("ol");
	toaster.setAttribute("data-sonner-toaster", "");
	toaster.dataset.yPosition = "bottom";
	host.append(toaster);
	document.body.append(host);
});

afterEach(async () => {
	await new Promise((resolve) => setTimeout(resolve, PIN_INPUT_SYNC_MS));
	cleanup();
	document.body.replaceChildren();
});

async function openConfig(): Promise<HTMLElement> {
	const { configure } = await opened(NotificationsPage);
	await fireEvent.click(configure);
	const sheet = await configSheet();
	await waitFor(() =>
		expect(sheet.contains(document.activeElement)).toBe(true),
	);
	return sheet;
}

async function chooseRelay() {
	const sheet = await openConfig();
	const options = sourceOptions(sheet);
	await fireEvent.click(setupButton(options.relay));
	return { sheet, ...options };
}

async function configScreen() {
	const chosen = await chooseRelay();
	expect(await relaySheet()).toBe(chosen.sheet);
	return chosen;
}

async function verifyScreen() {
	const shown = await configScreen();
	connection.resolve();
	await within(shown.sheet).findByText("Enter verification code");
	return {
		...shown,
		code: within(shown.sheet).getByRole<HTMLInputElement>("textbox", {
			name: "Enter verification code",
		}),
	};
}

function button(sheet: HTMLElement, name: string): HTMLElement {
	return within(sheet).getByRole("button", { name });
}

function openDialogs(): HTMLElement[] {
	return [
		...screen.queryAllByRole("dialog"),
		...screen.queryAllByRole("alertdialog"),
	];
}

async function typeCode(input: HTMLInputElement, code: string) {
	await fireEvent.input(input, { target: { value: code } });
}

function placeAt(element: Element, top: number): void {
	element.getBoundingClientRect = () => ({ top }) as DOMRect;
}

function anchor(): string {
	return toaster.style.getPropertyValue("--sheet-anchor");
}

function expectNothingInline(sheet: HTMLElement): void {
	expect(within(sheet).queryByRole("alert")).toBeNull();
	expect(
		within(sheet).queryByRole("button", { name: "Copy error details" }),
	).toBeNull();
}

describe("failures while the sources show", () => {
	it("toasts an add-on failure and keeps the sources", async () => {
		account.registerPushToken.mockRejectedValueOnce(new Error("500"));
		const sheet = await openConfig();
		const { addon } = sourceOptions(sheet);

		await fireEvent.click(setupButton(addon));

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({
					label: "Couldn’t enable Fast Mode for push notifications",
				}),
			),
		);
		expect(openDialogs()).toEqual([sheet]);
		expectNothingInline(sheet);
	});

	it.each([
		[
			"relayNoDistributor",
			"Install a UnifiedPush distributor app, such as ntfy, to use fcm-relay",
		],
		[
			"relayActionRequired",
			"Finish setting up your UnifiedPush distributor app, then try again",
		],
	] as const)(
		"hints at the fix in a toast when the distributor answers %s",
		async (reason, hint) => {
			push.beginRelaySetup.mockRejectedValueOnce(new PushFailure(reason));

			const { sheet } = await chooseRelay();

			await waitFor(() => expect(hintToast).toHaveBeenCalledWith(hint));
			expect(showErrorToast).not.toHaveBeenCalled();
			expectNothingInline(sheet);
		},
	);

	it("toasts any other setup failure with its reason in the details", async () => {
		const failure = new PushFailure("relayTimedOut");
		push.beginRelaySetup.mockRejectedValueOnce(failure);

		const { sheet } = await chooseRelay();

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith({
				label: "Couldn’t set up fcm-relay",
				error: expect.objectContaining({
					message:
						"The UnifiedPush distributor app didn't answer in time.",
					cause: failure,
				}),
			}),
		);
		expectNothingInline(sheet);
	});

	it("goes back to the sources and toasts when the distributor drops the setup", async () => {
		const { sheet } = await configScreen();

		connection.reject(new PushFailure("relaySetupLost"));

		expect(await configSheet()).toBe(sheet);
		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({ label: "Couldn’t set up fcm-relay" }),
			),
		);
	});
});

describe("failures in the fcm-relay wizard", () => {
	it.each([
		["Save", "saveRelayConfig", "relaySaveFailed", "save"],
		["Share", "shareRelayConfig", "relayShareFailed", "share"],
	] as const)(
		"toasts a failed %s and stays on the config screen",
		async (name, command, reason, verb) => {
			push[command].mockRejectedValueOnce(new PushFailure(reason));
			const { sheet } = await configScreen();

			await fireEvent.click(button(sheet, name));

			await waitFor(() =>
				expect(showErrorToast).toHaveBeenCalledWith(
					expect.objectContaining({
						label: `Couldn’t ${verb} the fcm-relay config`,
					}),
				),
			);
			expect(await relaySheet()).toBe(sheet);
			expectNothingInline(sheet);
		},
	);

	it("toasts a failed code check and keeps the code screen", async () => {
		push.commitRelay.mockRejectedValueOnce(new PushFailure("relayNetwork"));
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "123456");

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({
					label: "Couldn’t check the verification code",
				}),
			),
		);
		expect(
			within(sheet).getByRole("heading", {
				name: "Enter verification code",
			}),
		).toBeTruthy();
		expect(code.getAttribute("aria-invalid")).toBe("false");
		expect(
			within(sheet).queryByText("Incorrect verification code"),
		).toBeNull();
	});

	it("keeps a wrong code inline under the code instead of toasting it", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "123456");

		const label = await within(sheet).findByText(
			"Incorrect verification code",
		);
		expect(code.getAttribute("aria-describedby")).toBe(
			label.closest("p")?.id,
		);
		expect(showErrorToast).not.toHaveBeenCalled();
		expect(hintToast).not.toHaveBeenCalled();
	});
});

describe("where the toasts sit", () => {
	it("lifts them 12 px above the drawer’s top edge while the sources show", async () => {
		const sheet = await openConfig();
		expect(
			sheet.querySelector('[data-slot="drawer-handle"]'),
		).not.toBeNull();

		placeAt(sheet, 300);

		await waitFor(() =>
			expect(anchor()).toBe(`${innerHeight - 300 + 12}px`),
		);
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(true);
	});

	it("lifts them 12 px above the footer’s top button in the wizard", async () => {
		const { sheet } = await configScreen();

		placeAt(button(sheet, "Continue"), 700);
		placeAt(button(sheet, "Cancel"), 752);

		await waitFor(() =>
			expect(anchor()).toBe(`${innerHeight - 700 + 12}px`),
		);
	});

	it("follows the footer’s only button on screens without Continue", async () => {
		const { sheet } = await configScreen();
		await fireEvent.click(button(sheet, "Continue"));
		await within(sheet).findByRole("heading", {
			name: "Waiting for fcm-relay connection…",
		});

		placeAt(button(sheet, "Cancel"), 740);

		await waitFor(() =>
			expect(anchor()).toBe(`${innerHeight - 740 + 12}px`),
		);
	});

	it("lets them rest in their usual place again once the drawer closes", async () => {
		await openConfig();
		await waitFor(() =>
			expect(toaster.hasAttribute("data-sheet-anchored")).toBe(true),
		);

		runBackGestureHandlers();

		await waitFor(() => expect(openDialogs()).toEqual([]));
		expect(toaster.hasAttribute("data-sheet-anchored")).toBe(false);
		expect(anchor()).toBe("");
	});
});
