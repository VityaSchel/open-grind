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
	configSheet,
	configureField,
	disabled,
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

const PIN_INPUT_SYNC_MS = 60;

let connection: PromiseWithResolvers<void>;

beforeEach(async () => {
	document.elementFromPoint = () => null;
	await resetNotificationsPage();
	await withFastSource(null);
	connection = Promise.withResolvers<void>();
	push.awaitRelay.mockReturnValue(connection.promise);
});

afterEach(async () => {
	await new Promise((resolve) => setTimeout(resolve, PIN_INPUT_SYNC_MS));
	cleanup();
});

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

async function typeCode(input: HTMLInputElement, code: string) {
	await fireEvent.input(input, { target: { value: code } });
}

function settledFrames(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("entering the verification code", () => {
	it("asks for six digits grouped three and three once fcm-relay connects", async () => {
		const { sheet, code } = await verifyScreen();

		expect(code.maxLength).toBe(6);
		expect(
			sheet.querySelectorAll('[data-slot="input-otp-slot"]'),
		).toHaveLength(6);
		expect(
			sheet.querySelectorAll('[data-slot="input-otp-separator"]'),
		).toHaveLength(1);
		expect(button(sheet, "Cancel")).toBeTruthy();
		expect(
			within(sheet).queryByRole("button", { name: "Continue" }),
		).toBeNull();
	});

	it("focuses the code as soon as the code screen shows and keeps it there", async () => {
		const { sheet } = await configScreen();
		await waitFor(() =>
			expect(document.activeElement).toBe(button(sheet, "Save")),
		);

		connection.resolve();

		const code = await within(sheet).findByRole<HTMLInputElement>(
			"textbox",
			{ name: "Enter verification code" },
		);
		await waitFor(() => expect(document.activeElement).toBe(code));
		await settledFrames();
		expect(document.activeElement).toBe(code);
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

	it("reserves the error line’s room under the code before, during and after a wrong code", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { sheet, code } = await verifyScreen();
		const slot = sheet.querySelector<HTMLElement>(
			'[data-slot="relay-code-error"]',
		);
		expect(slot?.classList).toContain("min-h-8");
		expect(slot?.textContent.trim()).toBe("");

		await typeCode(code, "123456");
		await within(sheet).findByText("Incorrect verification code");

		expect(sheet.querySelector('[data-slot="relay-code-error"]')).toBe(
			slot,
		);
		expect(
			slot?.contains(
				within(sheet).getByText("Incorrect verification code"),
			),
		).toBe(true);
		await typeCode(code, "12345");
		await waitFor(() => expect(slot?.textContent.trim()).toBe(""));
		expect(sheet.querySelector('[data-slot="relay-code-error"]')).toBe(
			slot,
		);
	});

	it("marks a wrong code red and clears the mark as soon as a digit is removed", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "123456");

		expect(
			await within(sheet).findByText("Incorrect verification code"),
		).toBeTruthy();
		expect(code.getAttribute("aria-invalid")).toBe("true");
		await typeCode(code, "12345");
		await waitFor(() =>
			expect(
				within(sheet).queryByText("Incorrect verification code"),
			).toBeNull(),
		);
		expect(code.getAttribute("aria-invalid")).toBe("false");
	});

	it("marks every cell bright red on a wrong code, the focused one’s ring included and kept inside the cell", async () => {
		push.commitRelay.mockResolvedValue({ matched: false });
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "123456");
		await within(sheet).findByText("Incorrect verification code");

		const cells = sheet.querySelectorAll<HTMLElement>(
			'[data-slot="input-otp-slot"]',
		);
		for (const cell of cells) {
			expect(cell.getAttribute("aria-invalid")).toBe("true");
			expect(cell.classList).toContain(
				"data-[active=true]:aria-invalid:border-destructive",
			);
			expect(cell.classList).toContain(
				"data-[active=true]:aria-invalid:inset-ring-destructive",
			);
			expect(
				[...cell.classList].filter((name) =>
					/^(dark:)?data-\[active=true\]:aria-invalid:inset-ring-destructive\//.test(
						name,
					),
				),
			).toEqual([]);
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
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "123456");

		await waitFor(() => expect(code.disabled).toBe(true));
		expect(disabled(button(sheet, "Cancel"))).toBe(true);
		commit.resolve({ matched: false });
		await waitFor(() => expect(code.disabled).toBe(false));
		expect(disabled(button(sheet, "Cancel"))).toBe(false);
	});

	it("turns Fast Mode on with fcm-relay and says it’s connected with every step complete on the right code", async () => {
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "658591");

		const connected = await screen.findByRole("dialog", {
			name: "fcm-relay connected",
		});
		expect(connected).toBe(sheet);
		expect(
			within(sheet).getByText(
				"New messages and taps now arrive instantly through your fcm-relay.",
			),
		).toBeTruthy();
		expect(setupStep(sheet)).toBe("Step 3 of 3");
		expect(sheet.classList).toContain("h-(--screen-safe)");
		expect(within(sheet).queryByRole("textbox")).toBeNull();
		expect(
			within(sheet).queryByRole("button", { name: "Cancel" }),
		).toBeNull();
		expect(push.registerRelay).toHaveBeenCalledOnce();
		expect(push.setMode).toHaveBeenCalledWith("fast");
		expect(checked(screen.getByRole("radio", { name: /^Fast Mode/ }))).toBe(
			"true",
		);
		expect(configureField().textContent.trim()).toBe("fcm-relay");
	});

	it("focuses Continue once fcm-relay is connected, closes on Continue and hands focus back to the Configure field", async () => {
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "658591");

		const done = await within(sheet).findByRole("button", {
			name: "Continue",
		});
		await waitFor(() => expect(document.activeElement).toBe(done));
		await fireEvent.click(done);
		await waitFor(() => expect(openDialogs()).toEqual([]));
		await waitFor(() =>
			expect(document.activeElement).toBe(configureField()),
		);
	});

	it("opens on the sources again after fcm-relay was connected", async () => {
		const { sheet, code } = await verifyScreen();
		await typeCode(code, "658591");
		await fireEvent.click(
			await within(sheet).findByRole("button", { name: "Continue" }),
		);
		await waitFor(() => expect(openDialogs()).toEqual([]));

		await fireEvent.click(configureField());

		const reopened = await configSheet();
		const { relay } = sourceOptions(reopened);
		expect(optionAction(relay)).toBe("Modify");
		expect(reopened.classList).not.toContain("h-(--screen-safe)");
	});

	it("keeps the code screen with the code disabled and a spinner in place of the key while Grindr registers the token", async () => {
		const registration = Promise.withResolvers<void>();
		push.registerRelay.mockReturnValueOnce(registration.promise);
		const { sheet, code } = await verifyScreen();

		await typeCode(code, "658591");

		await waitFor(() => expect(push.registerRelay).toHaveBeenCalledOnce());
		expect(
			within(sheet).getByRole("heading", {
				name: "Enter verification code",
			}),
		).toBeTruthy();
		expect(code.disabled).toBe(true);
		expect(disabled(button(sheet, "Cancel"))).toBe(true);
		expect(
			sheet
				.querySelector('[data-slot="relay-verification-code"]')
				?.getAttribute("aria-busy"),
		).toBe("true");
		const icon = sheet.querySelector<HTMLElement>(
			'[data-slot="relay-setup-icon"]',
		);
		expect(
			within(icon ?? document.body).getByRole("status", { hidden: true }),
		).toBeTruthy();
		expect(setupStep(sheet)).toBe("Step 3 of 3");
		expect(push.setMode).not.toHaveBeenCalled();

		registration.resolve();

		expect(
			await screen.findByRole("dialog", { name: "fcm-relay connected" }),
		).toBe(sheet);
		expect(push.setMode).toHaveBeenCalledWith("fast");
	});

	it("keeps fcm-relay but stays on Slow Mode when Grindr refuses the token", async () => {
		push.registerRelay.mockRejectedValueOnce(
			new PushFailure("relayRegisterFailed"),
		);
		const { code } = await verifyScreen();

		await typeCode(code, "658591");

		await waitFor(() => expect(openDialogs()).toEqual([]));
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
