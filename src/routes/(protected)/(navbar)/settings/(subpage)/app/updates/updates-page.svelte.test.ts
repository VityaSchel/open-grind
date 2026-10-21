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

const FOREIGN_SIGNER = {
	state: "unsupported",
	detail: { reason: "foreignSigner" },
} satisfies Capability;
const FDROID_BUILD = installedBy("org.fdroid.fdroid");

const fake = updateApiFake();
const toasts = toastsFake();
const { updateSettings, platform } = vi.hoisted(() => ({
	updateSettings: {
		getUpdateCapability: vi.fn<() => Promise<Capability>>(),
		getUpdateSettings: vi.fn(),
		setAutomaticUpdateChecks: vi.fn(),
	},
	platform: { isAndroidPlatform: vi.fn(() => true) },
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

let testing: typeof import("@testing-library/svelte");

async function opened(capability: Capability) {
	updateSettings.getUpdateCapability.mockResolvedValue(capability);
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("$lib/updates/capability.svelte");
	await hydrateUpdateCapability();
	const { default: UpdatesPage } = await import("./+page.svelte");
	testing.render(UpdatesPage);
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

describe("the Updates settings on Android", () => {
	it("offers Google OAuth app updates on a store build signed by Open Grind", async () => {
		const screen = await opened(FDROID_BUILD);

		expect(
			screen.getByRole("switch", {
				name: /^Check add-on updates automatically/,
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Check for updates" }),
		).toBeTruthy();
		expect(screen.queryAllByRole("heading")).toEqual([]);
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

		const { default: UpdatesPage } = await import("./+page.svelte");
		testing.render(UpdatesPage);

		expect(automaticChecks().getAttribute("aria-checked")).toBe("true");
		expect(updateSettings.getUpdateSettings).toHaveBeenCalledOnce();
	}, 60_000);

	it("stays empty on a build someone else signed", async () => {
		const screen = await opened(FOREIGN_SIGNER);

		expect(screen.queryByRole("switch")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Check for updates" }),
		).toBeNull();
		expect(screen.queryByText(/updates automatically/)).toBeNull();
		expect(updateSettings.getUpdateSettings).not.toHaveBeenCalled();
	}, 60_000);
});

describe("the Updates settings in another language", () => {
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
