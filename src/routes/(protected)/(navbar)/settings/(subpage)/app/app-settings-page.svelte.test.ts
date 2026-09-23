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

import { toastsFake, updateApiFake } from "$lib/updates/updates-test-helpers";
import type { Capability } from "$lib/updates/types";

const PRIVACY_POLICY = "https://opengrind.org/privacy";

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
		const screen = await opened({
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		});

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
		const addonUpdates = {
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		} satisfies Capability;
		const automaticChecks = () =>
			testing.screen.getByRole("switch", {
				name: /^Check add-on updates automatically/,
			});

		await opened(addonUpdates);
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
		const screen = await opened({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});

		expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "Updates" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Check for updates" }),
		).toBeNull();
		expect(screen.queryByText(/updates automatically/)).toBeNull();
		expect(updateSettings.getUpdateSettings).not.toHaveBeenCalled();
	}, 60_000);
});

describe("the About section of the app settings", () => {
	it("lists the privacy policy right before the credits and opens it in the system browser", async () => {
		const screen = await opened({
			state: "unsupported",
			detail: { reason: "foreignSigner" },
		});

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
