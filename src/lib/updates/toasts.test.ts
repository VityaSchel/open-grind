import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

type ShownToast = { componentProps: Record<string, unknown> };

const { custom, getVersion } = vi.hoisted(() => ({
	custom: vi.fn<(component: unknown, toast: ShownToast) => void>(),
	getVersion: vi.fn<() => Promise<string>>(),
}));

vi.mock("svelte-sonner", () => ({ toast: { custom, dismiss: vi.fn() } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion }));
vi.mock("$lib/platform/link-opener", () => ({ openExternalLink: vi.fn() }));

import { showAddonInstalled, showInstalled, showManualInstall } from "./toasts";

const VERSION = "1.2.0";
const TAG = `v${VERSION}`;
const MANUAL_INSTALL_BODY = "Drag it onto Applications";

function shownCard(): Record<string, unknown> {
	expect(custom).toHaveBeenCalledOnce();
	const [, toast] = custom.mock.calls.at(0) ?? [];
	return toast?.componentProps ?? {};
}

beforeEach(() => {
	custom.mockReset();
	getVersion.mockReset().mockResolvedValue(VERSION);
});

describe("the add-on installed toast", () => {
	it("names the add-on and the version it installed", () => {
		showAddonInstalled({ component: "fcm", tag: TAG, kind: "install" });

		expect(shownCard()).toStrictEqual({
			icon: CheckCircleIcon,
			title: "Open Grind FCM service installed: v1.2.0",
			body: "Tap to see changelog",
			onActivate: expect.any(Function),
		});
	});

	it("says updated when an installed add-on updates", () => {
		showAddonInstalled({
			component: "recaptcha",
			tag: TAG,
			kind: "update",
		});

		expect(shownCard()).toStrictEqual({
			icon: CheckCircleIcon,
			title: "Open Grind reCAPTCHA helper updated: v1.2.0",
			body: "Tap to see changelog",
			onActivate: expect.any(Function),
		});
	});

	it("leaves out the version and the changelog for an install without a tag", () => {
		showAddonInstalled({
			component: "google-oauth",
			tag: null,
			kind: "install",
		});

		expect(shownCard()).toStrictEqual({
			icon: CheckCircleIcon,
			title: "Open Grind Google OAuth app installed",
			body: undefined,
			onActivate: undefined,
		});
	});

	it("leaves out the version and the changelog for an update without a tag", () => {
		showAddonInstalled({ component: "fcm", tag: null, kind: "update" });

		expect(shownCard()).toStrictEqual({
			icon: CheckCircleIcon,
			title: "Open Grind FCM service updated",
			body: undefined,
			onActivate: undefined,
		});
	});
});

describe("the manual install toast", () => {
	it("points to Finder above the steps it is given", () => {
		showManualInstall(MANUAL_INSTALL_BODY);

		expect(shownCard()).toStrictEqual({
			icon: FolderOpenIcon,
			title: "The update is ready in Finder",
			body: MANUAL_INSTALL_BODY,
		});
	});
});

describe("the app installed toast", () => {
	it("names the version the app updated to", async () => {
		await showInstalled();

		expect(shownCard()).toStrictEqual({
			icon: CheckCircleIcon,
			title: "Updated to v1.2.0",
			body: "Tap to see changelog",
			onActivate: expect.any(Function),
		});
	});
});

describe("the result toasts in another language", () => {
	beforeEach(async () => {
		await setLocale({ locale: "en-XA" });
	});

	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("words the add-on installed toast in that language", () => {
		showAddonInstalled({ component: "fcm", tag: TAG, kind: "install" });

		const { title, body } = shownCard();
		expect(title).toBe(
			t("updates.addons.fcm.installedVersion", { tag: TAG }),
		);
		expect(title).toMatch(PSEUDO_MESSAGE);
		expect(title).toContain(TAG);
		expect(body).toBe(t("updates.toasts.changelog"));
		expect(body).toMatch(PSEUDO_MESSAGE);
	});

	it("words the manual install toast in that language", () => {
		showManualInstall(MANUAL_INSTALL_BODY);

		const { title } = shownCard();
		expect(title).toBe(t("updates.toasts.manualInstall"));
		expect(title).toMatch(PSEUDO_MESSAGE);
	});

	it("words the app installed toast in that language", async () => {
		await showInstalled();

		const { title, body } = shownCard();
		expect(title).toBe(t("updates.toasts.updatedTo", { tag: TAG }));
		expect(title).toMatch(PSEUDO_MESSAGE);
		expect(title).toContain(TAG);
		expect(body).toMatch(PSEUDO_MESSAGE);
	});
});
