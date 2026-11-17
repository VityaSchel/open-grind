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
	checked,
	configSheet,
	configureField,
	disabled,
	hintToast,
	inMode,
	opened,
	optionAction,
	push,
	PushFailure,
	relaySheet,
	resetNotificationsPage,
	setupButton,
	setupStep,
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

const SAVE_CONFIG =
	"Save this file as the fcm-relay config on the machine you use to host fcm-relay and restart the fcm-relay, then tap “Continue”.";
const WAITING = "Waiting for fcm-relay connection…";
const WAITING_HINT =
	"If you’re stuck on this stage for a while, ensure fcm-relay is running with no errors in the logs.";

let connection: PromiseWithResolvers<void>;

beforeEach(async () => {
	document.elementFromPoint = () => null;
	await resetNotificationsPage();
	await withFastSource(null);
	connection = Promise.withResolvers<void>();
	push.awaitRelay.mockReturnValue(connection.promise);
});

afterEach(cleanup);

async function chooseRelay() {
	const { configure } = await opened(NotificationsPage);
	await fireEvent.click(configure);
	const sheet = await configSheet();
	await waitFor(() =>
		expect(sheet.contains(document.activeElement)).toBe(true),
	);
	const options = sourceOptions(sheet);
	await fireEvent.click(setupButton(options.relay));
	return { sheet, ...options };
}

async function configScreen() {
	const chosen = await chooseRelay();
	expect(await relaySheet()).toBe(chosen.sheet);
	return chosen;
}

async function waitingScreen() {
	const shown = await configScreen();
	await fireEvent.click(button(shown.sheet, "Continue"));
	await within(shown.sheet).findByText(WAITING);
	return shown;
}

async function verifyScreen() {
	const shown = await configScreen();
	connection.resolve();
	await within(shown.sheet).findByText("Enter verification code");
	return { ...shown, code: codeInput(shown.sheet) };
}

function codeInput(sheet: HTMLElement): HTMLInputElement {
	return within(sheet).getByRole<HTMLInputElement>("textbox", {
		name: "Enter verification code",
	});
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

function settledFrames(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("choosing fcm-relay", () => {
	it("disables both buttons and spins on fcm-relay’s while the distributor answers", async () => {
		const begin = Promise.withResolvers<void>();
		push.beginRelaySetup.mockReturnValueOnce(begin.promise);

		const { sheet, addon, relay } = await chooseRelay();

		expect(disabled(setupButton(addon))).toBe(true);
		expect(disabled(setupButton(relay))).toBe(true);
		expect(setupButton(relay).getAttribute("aria-busy")).toBe("true");
		expect(setupButton(addon).getAttribute("aria-busy")).toBe("false");
		expect(
			within(setupButton(relay)).getByRole("status", { hidden: true }),
		).toBeTruthy();
		expect(optionAction(relay)).toBe("Set up");
		expect(
			screen.queryByRole("dialog", { name: "Save the fcm-relay config" }),
		).toBeNull();
		begin.resolve();
		expect(await relaySheet()).toBe(sheet);
	});

	it("turns the same sheet into the config screen with Save, Share, Continue and Cancel and never the config itself", async () => {
		const { sheet } = await configScreen();

		expect(openDialogs()).toEqual([sheet]);
		expect(within(sheet).getByText(SAVE_CONFIG)).toBeTruthy();
		for (const name of ["Save", "Share", "Continue", "Cancel"])
			expect(button(sheet, name)).toBeTruthy();
		expect(
			sheet.querySelector('[data-slot="fast-mode-option"]'),
		).toBeNull();
		expect(within(sheet).queryByRole("textbox")).toBeNull();
		expect(
			within(sheet).queryByRole("button", { name: "Close" }),
		).toBeNull();
	});

	it("focuses Save on the config screen", async () => {
		const { sheet } = await configScreen();

		await waitFor(() =>
			expect(document.activeElement).toBe(button(sheet, "Save")),
		);
	});

	it("stays on the config screen on Escape, Back, a tap outside and a swipe down, with no drag handle", async () => {
		const { sheet } = await configScreen();

		expect(sheet.querySelector('[data-slot="drawer-handle"]')).toBeNull();
		await fireEvent.keyDown(sheet, { key: "Escape" });
		runBackGestureHandlers();
		const overlay =
			document.querySelector<HTMLElement>(
				'[data-slot="drawer-overlay"]',
			) ?? document.body;
		await fireEvent.pointerDown(overlay);
		await fireEvent.pointerUp(overlay);
		await fireEvent.click(overlay);
		await fireEvent.pointerDown(sheet, { pageY: 0, pointerId: 1 });
		await fireEvent.pointerMove(sheet, { pageY: 600, pointerId: 1 });
		await fireEvent.pointerUp(sheet, { pageY: 600, pointerId: 1 });
		await settledFrames();

		expect(openDialogs()).toEqual([sheet]);
		expect(within(sheet).getByText(SAVE_CONFIG)).toBeTruthy();
		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
	});

	it("spins on Save and locks the screen while the file is saved", async () => {
		const saving = Promise.withResolvers<boolean>();
		push.saveRelayConfig.mockReturnValueOnce(saving.promise);
		const { sheet } = await configScreen();

		await fireEvent.click(button(sheet, "Save"));

		const save = button(sheet, "Save");
		expect(save.getAttribute("aria-busy")).toBe("true");
		expect(within(save).getByRole("status", { hidden: true })).toBeTruthy();
		for (const name of ["Share", "Continue", "Cancel"])
			expect(disabled(button(sheet, name))).toBe(true);
		saving.resolve(true);
		await waitFor(() =>
			expect(disabled(button(sheet, "Continue"))).toBe(false),
		);
		expect(button(sheet, "Save").getAttribute("aria-busy")).toBe("false");
	});

	it("shares the config file", async () => {
		const { sheet } = await configScreen();

		await fireEvent.click(button(sheet, "Share"));

		await waitFor(() =>
			expect(push.shareRelayConfig).toHaveBeenCalledOnce(),
		);
	});

	it("waits for the fcm-relay connection after Continue, keeping only Cancel and focusing it", async () => {
		const { sheet } = await waitingScreen();

		expect(within(sheet).getByText(WAITING_HINT)).toBeTruthy();
		expect(
			within(sheet).queryByRole("button", { name: "Continue" }),
		).toBeNull();
		expect(
			within(sheet).queryByRole("button", { name: "Save" }),
		).toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(button(sheet, "Cancel")),
		);
	});

	it("spins in the icon circle above the waiting text without announcing the spinner", async () => {
		const { sheet } = await waitingScreen();

		const icon = sheet.querySelector<HTMLElement>(
			'[data-slot="relay-setup-icon"]',
		);
		const spinner = within(icon ?? document.body).getByRole("status", {
			hidden: true,
		});
		expect(spinner.getAttribute("aria-hidden")).toBe("true");
		expect(
			within(sheet).getByRole("heading", { name: WAITING }),
		).toBeTruthy();
		expect(
			within(sheet)
				.getByRole("status")
				.textContent.replace(/\s+/g, " ")
				.trim(),
		).toBe(`${WAITING} ${WAITING_HINT}`);
	});

	it("announces the wait for the fcm-relay connection through a status region mounted before it", async () => {
		const { sheet } = await configScreen();
		const status = within(sheet).getByRole("status");
		expect(status.textContent.trim()).toBe("");

		await fireEvent.click(button(sheet, "Continue"));

		await waitFor(() =>
			expect(status.textContent.replace(/\s+/g, " ").trim()).toBe(
				`${WAITING} ${WAITING_HINT}`,
			),
		);
		expect(within(sheet).getByRole("status")).toBe(status);
	});

	it.each([
		["config", configScreen],
		["waiting", waitingScreen],
		["code", verifyScreen],
	] as const)(
		"cancels the setup from the %s screen and goes back to the sources with fcm-relay focused",
		async (_screen, shown) => {
			const { sheet } = await shown();

			await fireEvent.click(button(sheet, "Cancel"));

			expect(await configSheet()).toBe(sheet);
			expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
			expect(openDialogs()).toEqual([sheet]);
			const { relay } = sourceOptions(sheet);
			expect(optionAction(relay)).toBe("Set up");
			expect(disabled(setupButton(relay))).toBe(false);
			await waitFor(() =>
				expect(document.activeElement).toBe(setupButton(relay)),
			);
		},
	);

	it.each(["relayCancelled", "relayDistributorUnavailable"] as const)(
		"says nothing when the setup ends with %s",
		async (reason) => {
			push.beginRelaySetup.mockRejectedValueOnce(new PushFailure(reason));

			const { relay } = await chooseRelay();

			await waitFor(() =>
				expect(disabled(setupButton(relay))).toBe(false),
			);
			expect(hintToast).not.toHaveBeenCalled();
			expect(showErrorToast).not.toHaveBeenCalled();
		},
	);
});

describe("the step dots and the drawer", () => {
	it.each([
		["config", configScreen, "Step 1 of 3", 0],
		["waiting", waitingScreen, "Step 2 of 3", 1],
		["code", verifyScreen, "Step 3 of 3", 2],
	] as const)(
		"stretches the %s step’s dot into a pill",
		async (_screen, shown, label, position) => {
			const { sheet } = await shown();

			expect(setupStep(sheet)).toBe(label);
			const dots = sheet.querySelector<HTMLElement>(
				'[data-slot="page-indicator"]',
			);
			const bullets = [...(dots?.children ?? [])];
			expect(bullets).toHaveLength(3);
			expect(
				bullets.map((bullet) => bullet.hasAttribute("data-current")),
			).toEqual([0, 1, 2].map((index) => index === position));
			expect(bullets[position]?.classList).toContain("w-5");
			expect(bullets[position]?.classList).toContain("bg-primary");
			for (const bullet of bullets.filter(
				(_, index) => index !== position,
			))
				expect(bullet.classList).toContain("w-2");
			expect(dots?.classList).toContain("flex-row");
		},
	);

	it("animates the pill between steps with the same dots element", async () => {
		const { sheet } = await configScreen();
		const dots = sheet.querySelector('[data-slot="page-indicator"]');

		await fireEvent.click(button(sheet, "Continue"));
		await within(sheet).findByRole("heading", { name: WAITING });

		expect(sheet.querySelector('[data-slot="page-indicator"]')).toBe(dots);
		const pill = dots?.querySelector("[data-current]");
		expect(pill).toBe(dots?.children[1]);
		expect(pill?.classList).toContain(
			"transition-[width,height,background-color]",
		);
		expect(pill?.classList).toContain("motion-reduce:transition-none");
	});

	it("grows the drawer to full height for the setup and back to its own height with its drag handle on Cancel", async () => {
		const { sheet } = await configScreen();

		expect(sheet.classList).toContain("h-(--screen-safe)");

		await fireEvent.click(button(sheet, "Cancel"));

		expect(await configSheet()).toBe(sheet);
		expect(sheet.classList).not.toContain("h-(--screen-safe)");
		expect(
			sheet.querySelector('[data-slot="drawer-handle"]'),
		).not.toBeNull();
	});

	it("titles each step with its own heading under the dots", async () => {
		const { sheet } = await configScreen();

		expect(
			within(sheet).getByRole("heading", {
				level: 2,
				name: "Save the fcm-relay config",
			}),
		).toBeTruthy();
		const dots = within(sheet).getByRole("img", { name: "Step 1 of 3" });
		const icon = sheet.querySelector('[data-slot="relay-setup-icon"]');
		expect(
			dots.compareDocumentPosition(icon ?? document.body) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});
});

describe("Fast Mode with a source set up", () => {
	it("re-registers fcm-relay instead of opening the sheet", async () => {
		push.relayStatus.mockResolvedValue({ paired: true, broken: false });
		await withFastSource("relay");
		const { fast } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		await waitFor(() => expect(checked(fast)).toBe("true"));
		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(openDialogs()).toEqual([]);
	});

	it("opens the sheet again when fcm-relay stopped working", async () => {
		inMode("slow");
		push.relayStatus.mockResolvedValue({ paired: true, broken: true });
		await withFastSource("relay");
		const { fast, slow } = await opened(NotificationsPage);

		await fireEvent.click(fast);

		const { relay } = sourceOptions(await configSheet());
		expect(push.forgetRelay).toHaveBeenCalledOnce();
		expect(optionAction(relay)).toBe("Set up");
		expect(checked(slow)).toBe("true");
		expect(configureField().textContent.trim()).toBe("Configure");
	});
});
