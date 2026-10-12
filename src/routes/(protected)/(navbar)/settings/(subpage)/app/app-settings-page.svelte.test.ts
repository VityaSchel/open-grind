// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	installedBy,
	toastsFake,
	updateApiFake,
} from "$lib/updates/updates-test-helpers";
import type { Capability } from "$lib/updates/types";

const PRIVACY_POLICY = "https://opengrind.org/privacy";
const FOREIGN_SIGNER = {
	state: "unsupported",
	detail: { reason: "foreignSigner" },
} satisfies Capability;
const FDROID_BUILD = installedBy("org.fdroid.fdroid");

const fake = updateApiFake();
const toasts = toastsFake();
const { updateSettings, platform, linkOpener } = vi.hoisted(() => ({
	updateSettings: {
		getUpdateCapability: vi.fn<() => Promise<Capability>>(),
		getUpdateSettings: vi.fn(),
		setAutomaticUpdateChecks: vi.fn(),
	},
	platform: { isAndroidPlatform: vi.fn(() => true) },
	linkOpener: { openExternalLink: vi.fn() },
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/updates/index", async () => ({
	...(await import("$lib/updates/types")),
	...(await import("$lib/updates/components")),
	...fake.api,
	...updateSettings,
}));
vi.mock("$lib/updates/toasts", () => toasts);
vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	...platform,
}));
vi.mock("$lib/platform/link-opener", () => linkOpener);

let testing: typeof import("@testing-library/svelte");

async function opened(capability: Capability) {
	updateSettings.getUpdateCapability.mockResolvedValue(capability);
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("$lib/updates/capability.svelte");
	await hydrateUpdateCapability();
	const { default: AppSettingsPage } = await import("./+page.svelte");
	testing.render(AppSettingsPage);
	return testing.screen;
}

beforeAll(async () => {
	await import("@testing-library/svelte");
	await import("./+page.svelte");
}, 90_000);

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	fake.reset();
	platform.isAndroidPlatform.mockReturnValue(true);
	updateSettings.getUpdateSettings.mockResolvedValue({ autoCheck: false });
});

afterEach(() => {
	testing.cleanup();
});

describe("the Updates section of the app settings on Android", () => {
	it("offers Google OAuth app updates on a store build signed by Open Grind", async () => {
		const screen = await opened(FDROID_BUILD);

		expect(screen.getByRole("heading", { name: "Updates" })).toBeTruthy();
		expect(
			screen.getByRole("switch", {
				name: /^Check add-on updates automatically/,
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Check for updates" }),
		).toBeTruthy();
	}, 60_000);

	it("shows the saved automatic checks value on the first frame when opened again", async () => {
		updateSettings.getUpdateSettings.mockResolvedValue({ autoCheck: true });
		const automaticChecks = () =>
			testing.screen.getByRole("switch", {
				name: /^Check add-on updates automatically/,
			});

		await opened(FDROID_BUILD);
		await testing.waitFor(() => {
			expect(automaticChecks().getAttribute("aria-checked")).toBe("true");
		});
		testing.cleanup();

		const { default: AppSettingsPage } = await import("./+page.svelte");
		testing.render(AppSettingsPage);

		expect(automaticChecks().getAttribute("aria-checked")).toBe("true");
		expect(updateSettings.getUpdateSettings).toHaveBeenCalledOnce();
	}, 60_000);

	it("stays hidden on a build someone else signed", async () => {
		const screen = await opened(FOREIGN_SIGNER);

		expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "Updates" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Check for updates" }),
		).toBeNull();
		expect(screen.queryByText(/updates automatically/)).toBeNull();
		expect(updateSettings.getUpdateSettings).not.toHaveBeenCalled();
	}, 60_000);
});

describe("the Updates rows in another language", () => {
	it("follow the active locale", async () => {
		updateSettings.setAutomaticUpdateChecks.mockRejectedValueOnce(
			new Error("read-only"),
		);
		const screen = await opened(FDROID_BUILD);
		const automaticChecks = screen.getByRole<HTMLButtonElement>("switch", {
			name: /^Check add-on updates automatically/,
		});
		await testing.waitFor(() => {
			expect(automaticChecks.disabled).toBe(false);
		});
		const copy = [
			screen.getByText("Check add-on updates automatically"),
			screen.getByText(/^Periodically ask git\.opengrind\.org/),
			screen.getByRole("button", { name: "Check for updates" }),
		];
		const { setLocale } = await import("$lib/i18n");
		const { showErrorToast } = await import("$lib/api/error-toast");

		await setLocale({ locale: "en-XA" });
		automaticChecks.click();

		for (const element of copy) {
			expect(element.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
		await testing.waitFor(() => {
			expect(showErrorToast).toHaveBeenCalledExactlyOnceWith({
				label: expect.stringMatching(PSEUDO_MESSAGE),
				error: new Error("read-only"),
			});
		});
	}, 60_000);
});

describe("the About section of the app settings", () => {
	it("lists the privacy policy right before the credits and opens it in the system browser", async () => {
		const screen = await opened(FOREIGN_SIGNER);

		const privacyPolicy = screen.getByRole("link", {
			name: "Privacy policy",
		});
		expect(privacyPolicy.nextElementSibling).toBe(
			screen.getByRole("link", { name: "Credits & Licenses" }),
		);
		expect(privacyPolicy.getAttribute("href")).toBe(PRIVACY_POLICY);

		privacyPolicy.click();

		expect(linkOpener.openExternalLink).toHaveBeenCalledExactlyOnceWith(
			PRIVACY_POLICY,
		);
	}, 60_000);
});

describe("the app settings copy", () => {
	it("names its sections and rows", async () => {
		const screen = await opened(FOREIGN_SIGNER);

		expect(
			screen
				.getAllByRole("heading")
				.map((heading) => heading.textContent.trim()),
		).toEqual(["Display", "Privacy", "Security", "About"]);
		expect(
			screen.getAllByRole("link").map((link) => link.textContent.trim()),
		).toEqual([
			"Notifications",
			"Discreet App Icon",
			"PIN",
			"Privacy policy",
			"Credits & Licenses",
		]);
		expect(
			screen.getByText(
				"Let others know when you’ve read their messages. Your read receipts remain unaffected.",
			),
		).toBeTruthy();
		expect(
			screen.getByText(
				"Let others know when you’ve viewed their profile. Your profile view history remains unaffected.",
			),
		).toBeTruthy();
	}, 60_000);

	it("follows the active locale", async () => {
		const screen = await opened(FOREIGN_SIGNER);
		const copy = [
			...screen.getAllByRole("heading"),
			...screen.getAllByRole("link"),
			screen.getByText("Haptic feedback"),
			screen.getByText("Stay online while the app is open"),
			screen.getByText(/^Refresh your online status/),
			screen.getByText("Reveal message read status"),
			screen.getByText("Reveal profile views"),
		];
		const { setLocale } = await import("$lib/i18n");

		await setLocale({ locale: "en-XA" });

		for (const element of copy) {
			expect(element.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	}, 60_000);
});
