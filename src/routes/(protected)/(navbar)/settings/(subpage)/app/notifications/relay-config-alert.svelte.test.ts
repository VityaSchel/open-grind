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
import type { RelayCommit } from "#lib/push/types.ts";
import type * as Capability from "#lib/updates/capability.svelte.ts";
import {
	checked,
	configDialog,
	configureField,
	disabled,
	hintToast,
	opened,
	push,
	PushFailure,
	relayAlert,
	resetNotificationsPage,
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
	"Save this file as the fcm-relay config on the machine you use to host fcm-relay and restart the fcm-relay, then tap “Done”.";
const WAITING = "Waiting for fcm-relay connection…";
const WAITING_HINT =
	"If you’re stuck on this stage for a while, ensure fcm-relay is running with no errors in the logs.";

let connection: PromiseWithResolvers<void>;

beforeEach(async () => {
	await resetNotificationsPage();
	await withFastSource(null);
	connection = Promise.withResolvers<void>();
	push.awaitRelay.mockReturnValue(connection.promise);
});

afterEach(cleanup);

async function chooseRelay() {
	const { configure } = await opened(NotificationsPage);
	await fireEvent.click(configure);
	const dialog = await configDialog();
	const options = sourceOptions(dialog);
	await fireEvent.click(options.relay);
	return { dialog, ...options };
}

async function configScreen() {
	const chosen = await chooseRelay();
	return { ...chosen, alert: await relayAlert() };
}

async function verifyScreen() {
	const shown = await configScreen();
	connection.resolve();
	await within(shown.alert).findByText("Enter verification code");
	return { ...shown, code: codeInput(shown.alert) };
}

function codeInput(alert: HTMLElement): HTMLInputElement {
	return within(alert).getByRole<HTMLInputElement>("textbox", {
		name: "Enter verification code",
	});
}

function button(alert: HTMLElement, name: string): HTMLElement {
	return within(alert).getByRole("button", { name });
}

async function typeCode(input: HTMLInputElement, code: string) {
	await fireEvent.input(input, { target: { value: code } });
}

describe("choosing fcm-relay", () => {
	it("disables both sources and spins on fcm-relay while the distributor answers", async () => {
		const begin = Promise.withResolvers<void>();
		push.beginRelaySetup.mockReturnValueOnce(begin.promise);

		const { addon, relay } = await chooseRelay();

		expect(disabled(addon)).toBe(true);
		expect(disabled(relay)).toBe(true);
		expect(relay.getAttribute("aria-busy")).toBe("true");
		expect(
			within(relay).getByRole("status", { hidden: true }),
		).toBeTruthy();
		expect(checked(relay)).toBe("false");
		expect(
			screen.queryByRole("alertdialog", { name: "fcm-relay config" }),
		).toBeNull();
		begin.resolve();
		await relayAlert();
	});

	it("shows the config screen with Save, Share, Done and Cancel and never the config itself", async () => {
		const { alert } = await configScreen();

		expect(within(alert).getByText(SAVE_CONFIG)).toBeTruthy();
		for (const name of ["Save", "Share", "Done", "Cancel"])
			expect(button(alert, name)).toBeTruthy();
		expect(within(alert).queryByRole("textbox")).toBeNull();
	});

	it("stays open on Escape", async () => {
		const { alert } = await configScreen();

		await fireEvent.keyDown(alert, { key: "Escape" });

		expect(
			screen.getByRole("alertdialog", { name: "fcm-relay config" }),
		).toBe(alert);
		expect(push.cancelRelaySetup).not.toHaveBeenCalled();
	});

	it("spins on Save and locks the alert while the file is saved", async () => {
		const saving = Promise.withResolvers<boolean>();
		push.saveRelayConfig.mockReturnValueOnce(saving.promise);
		const { alert } = await configScreen();

		await fireEvent.click(button(alert, "Save"));

		const save = button(alert, "Save");
		expect(save.getAttribute("aria-busy")).toBe("true");
		expect(within(save).getByRole("status", { hidden: true })).toBeTruthy();
		for (const name of ["Share", "Done", "Cancel"])
			expect(disabled(button(alert, name))).toBe(true);
		saving.resolve(true);
		await waitFor(() =>
			expect(disabled(button(alert, "Done"))).toBe(false),
		);
		expect(button(alert, "Save").getAttribute("aria-busy")).toBe("false");
	});

	it("shares the config file", async () => {
		const { alert } = await configScreen();

		await fireEvent.click(button(alert, "Share"));

		await waitFor(() =>
			expect(push.shareRelayConfig).toHaveBeenCalledOnce(),
		);
	});

	it("waits for the fcm-relay connection after Done, keeping only Cancel", async () => {
		const { alert } = await configScreen();

		await fireEvent.click(button(alert, "Done"));

		expect(await within(alert).findByText(WAITING)).toBeTruthy();
		expect(within(alert).getByText(WAITING_HINT)).toBeTruthy();
		expect(
			within(alert).queryByRole("button", { name: "Done" }),
		).toBeNull();
		expect(
			within(alert).queryByRole("button", { name: "Save" }),
		).toBeNull();
		expect(button(alert, "Cancel")).toBeTruthy();
	});

	it("announces the wait for the fcm-relay connection through a status region mounted before it", async () => {
		const { alert } = await configScreen();
		const status = within(alert).getByRole("status");
		expect(status.textContent.trim()).toBe("");

		await fireEvent.click(button(alert, "Done"));

		await waitFor(() =>
			expect(status.textContent.replace(/\s+/g, " ").trim()).toBe(
				`${WAITING} ${WAITING_HINT}`,
			),
		);
		expect(within(alert).getByRole("status")).toBe(status);
	});

	it("cancels the setup and goes back to the Configure dialog", async () => {
		const { alert, dialog, relay } = await configScreen();

		await fireEvent.click(button(alert, "Cancel"));

		await waitFor(() =>
			expect(
				screen.queryByRole("alertdialog", { name: "fcm-relay config" }),
			).toBeNull(),
		);
		expect(push.cancelRelaySetup).toHaveBeenCalledOnce();
		expect(screen.getByRole("alertdialog")).toBe(dialog);
		expect(checked(relay)).toBe("false");
		expect(disabled(relay)).toBe(false);
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
		"hints at the fix when the distributor answers %s",
		async (reason, hint) => {
			push.beginRelaySetup.mockRejectedValueOnce(new PushFailure(reason));

			const { relay } = await chooseRelay();

			await waitFor(() => expect(hintToast).toHaveBeenCalledWith(hint));
			expect(
				screen.queryByRole("alertdialog", { name: "fcm-relay config" }),
			).toBeNull();
			expect(disabled(relay)).toBe(false);
		},
	);

	it.each(["relayCancelled", "relayDistributorUnavailable"] as const)(
		"says nothing when the setup ends with %s",
		async (reason) => {
			push.beginRelaySetup.mockRejectedValueOnce(new PushFailure(reason));

			const { relay } = await chooseRelay();

			await waitFor(() => expect(disabled(relay)).toBe(false));
			expect(hintToast).not.toHaveBeenCalled();
			expect(showErrorToast).not.toHaveBeenCalled();
		},
	);

	it("explains any other setup failure", async () => {
		push.beginRelaySetup.mockRejectedValueOnce(
			new PushFailure("relayTimedOut"),
		);

		await chooseRelay();

		await waitFor(() =>
			expect(showErrorToast).toHaveBeenCalledWith(
				expect.objectContaining({ label: "Couldn’t set up fcm-relay" }),
			),
		);
	});
});

describe("entering the verification code", () => {
	it("asks for six digits grouped three and three once fcm-relay connects", async () => {
		const { alert, code } = await verifyScreen();

		expect(code.maxLength).toBe(6);
		expect(
			alert.querySelectorAll('[data-slot="input-otp-slot"]'),
		).toHaveLength(6);
		expect(
			alert.querySelectorAll('[data-slot="input-otp-separator"]'),
		).toHaveLength(1);
		expect(button(alert, "Cancel")).toBeTruthy();
		expect(
			within(alert).queryByRole("button", { name: "Done" }),
		).toBeNull();
	});

	it("checks the code only once all six digits are in", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { code } = await verifyScreen();

		await typeCode(code, "65859");
		expect(push.commitRelay).not.toHaveBeenCalled();

		await typeCode(code, "658591");
		await waitFor(() =>
			expect(push.commitRelay).toHaveBeenCalledExactlyOnceWith("658591"),
		);
	});

	it("marks a wrong code red and clears the mark as soon as a digit is removed", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { alert, code } = await verifyScreen();

		await typeCode(code, "123456");

		expect(
			await within(alert).findByText("Incorrect verification code"),
		).toBeTruthy();
		expect(code.getAttribute("aria-invalid")).toBe("true");
		await typeCode(code, "12345");
		await waitFor(() =>
			expect(
				within(alert).queryByText("Incorrect verification code"),
			).toBeNull(),
		);
		expect(code.getAttribute("aria-invalid")).toBe("false");
	});

	it("marks every cell red on a wrong code, the focused one included, with its ring kept inside the cell", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { alert, code } = await verifyScreen();

		await typeCode(code, "123456");
		await within(alert).findByText("Incorrect verification code");

		const cells = alert.querySelectorAll<HTMLElement>(
			'[data-slot="input-otp-slot"]',
		);
		for (const cell of cells) {
			expect(cell.getAttribute("aria-invalid")).toBe("true");
			expect(cell.classList).toContain(
				"data-[active=true]:aria-invalid:border-destructive",
			);
			expect(cell.classList).toContain("data-[active=true]:inset-ring-3");
			expect(
				[...cell.classList].filter((name) =>
					/^(dark:)?data-\[active=true\]:(aria-invalid:)?ring-/.test(
						name,
					),
				),
			).toEqual([]);
		}
	});

	it("locks the code and Cancel while the code is checked", async () => {
		const commit = Promise.withResolvers<RelayCommit>();
		push.commitRelay.mockReturnValueOnce(commit.promise);
		const { alert, code } = await verifyScreen();

		await typeCode(code, "123456");

		await waitFor(() => expect(code.disabled).toBe(true));
		expect(disabled(button(alert, "Cancel"))).toBe(true);
		commit.resolve({ matched: false });
		await waitFor(() => expect(code.disabled).toBe(false));
		expect(disabled(button(alert, "Cancel"))).toBe(false);
	});

	it("selects fcm-relay, turns Fast Mode on and closes both dialogs on the right code", async () => {
		const { code } = await verifyScreen();

		await typeCode(code, "658591");

		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(checked(screen.getByRole("radio", { name: /^Fast Mode/ }))).toBe(
			"true",
		);
		expect(configureField().textContent.trim()).toBe("fcm-relay");
	});

	it("closes the code screen at once and keeps fcm-relay busy in the Configure dialog while Grindr registers the token", async () => {
		const registration = Promise.withResolvers<void>();
		push.registerRelay.mockReturnValueOnce(registration.promise);
		const { code, dialog, addon, relay } = await verifyScreen();

		await typeCode(code, "658591");

		await waitFor(() =>
			expect(
				screen.queryByRole("alertdialog", { name: "fcm-relay config" }),
			).toBeNull(),
		);
		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(screen.getByRole("alertdialog")).toBe(dialog);
		expect(checked(relay)).toBe("true");
		expect(relay.getAttribute("aria-busy")).toBe("true");
		expect(
			within(relay).getByRole("status", { hidden: true }),
		).toBeTruthy();
		expect(disabled(addon)).toBe(true);
		expect(disabled(relay)).toBe(true);
		expect(push.setMode).not.toHaveBeenCalled();

		registration.resolve();

		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(checked(screen.getByRole("radio", { name: /^Fast Mode/ }))).toBe(
			"true",
		);
	});

	it("keeps focus inside the Configure dialog while Grindr registers the token, then hands it to the Configure field", async () => {
		const registration = Promise.withResolvers<void>();
		push.registerRelay.mockReturnValueOnce(registration.promise);
		const { configure } = await opened(NotificationsPage);
		await fireEvent.click(configure);
		const dialog = await configDialog();
		await waitFor(() =>
			expect(dialog.contains(document.activeElement)).toBe(true),
		);
		const { relay } = sourceOptions(dialog);
		relay.focus();
		await fireEvent.click(relay);
		const alert = await relayAlert();
		await waitFor(() =>
			expect(alert.contains(document.activeElement)).toBe(true),
		);
		connection.resolve();
		await within(alert).findByText("Enter verification code");
		const code = codeInput(alert);
		await waitFor(() => expect(document.activeElement).toBe(code));

		await typeCode(code, "658591");

		await waitFor(() => expect(alert.isConnected).toBe(false));
		const close = within(dialog).getByRole("button", { name: "Close" });
		await waitFor(() => expect(document.activeElement).toBe(close));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(document.activeElement).toBe(close);

		registration.resolve();

		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		await waitFor(() =>
			expect(document.activeElement).toBe(configureField()),
		);
	});

	it("keeps fcm-relay but stays on Slow Mode when Grindr refuses the token", async () => {
		push.registerRelay.mockRejectedValueOnce(
			new PushFailure("relayRegisterFailed"),
		);
		const { code } = await verifyScreen();

		await typeCode(code, "658591");

		await waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(showErrorToast).toHaveBeenCalledWith(
			expect.objectContaining({
				label: "Couldn’t enable Fast Mode for push notifications",
				onRetry: expect.any(Function),
			}),
		);
		expect(checked(screen.getByRole("radio", { name: /^Slow Mode/ }))).toBe(
			"true",
		);
		expect(configureField().textContent.trim()).toBe("fcm-relay");
	});
});
