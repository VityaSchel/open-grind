// @vitest-environment jsdom

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
import { installedBy, updateApiFake } from "$lib/updates/updates-test-helpers";
import type { Capability } from "$lib/updates/types";

const PRIVACY_POLICY = "https://opengrind.org/privacy";
const FOREIGN_SIGNER = {
	state: "unsupported",
	detail: { reason: "foreignSigner" },
} satisfies Capability;
const FDROID_BUILD = installedBy("org.fdroid.fdroid");
const SELF_UPDATING = {
	state: "supported",
	detail: { payloadSuffix: "universal-release.apk", canInstallNow: true },
} satisfies Capability;
const READ_ONLY_INSTALL = {
	state: "unsupported",
	detail: {
		reason: "locationNotWritable",
		detail: { path: "/opt/open-grind" },
	},
} satisfies Capability;
const DISTRIBUTION_PACKAGE = {
	state: "unsupported",
	detail: { reason: "noReleaseArtifacts", detail: { target: "flatpak" } },
} satisfies Capability;
const SUBSCREENS = [
	{ name: "Language English", href: "/settings/app/language" },
	{ name: "Display", href: "/settings/app/display" },
	{ name: "Notifications", href: "/settings/app/notifications" },
	{ name: "Privacy", href: "/settings/app/privacy" },
	{ name: "Security", href: "/settings/app/security" },
];
const UPDATES = { name: "Updates", href: "/settings/app/updates" };
const ABOUT = [
	{ name: "Privacy policy", href: PRIVACY_POLICY },
	{ name: "Credits & Licenses", href: "/settings/app/credits" },
];

const fake = updateApiFake();
const { capabilityApi, platform, linkOpener } = vi.hoisted(() => ({
	capabilityApi: { getUpdateCapability: vi.fn<() => Promise<Capability>>() },
	platform: { isAndroidPlatform: vi.fn(() => true) },
	linkOpener: { openExternalLink: vi.fn() },
}));

vi.mock("$lib/updates/index", async () => ({
	...(await import("$lib/updates/types")),
	...(await import("$lib/updates/components")),
	...fake.api,
	...capabilityApi,
}));
vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	...platform,
}));
vi.mock("$lib/platform/link-opener", () => linkOpener);

let testing: typeof import("@testing-library/svelte");

async function opened({
	capability,
	android = true,
}: {
	capability: Capability;
	android?: boolean;
}) {
	capabilityApi.getUpdateCapability.mockResolvedValue(capability);
	platform.isAndroidPlatform.mockReturnValue(android);
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("$lib/updates/capability.svelte");
	await hydrateUpdateCapability();
	const { default: AppSettingsPage } = await import("./+page.svelte");
	testing.render(AppSettingsPage);
	return testing.screen;
}

function rows(): { name: string; href: string | null }[] {
	return testing.screen
		.getAllByRole("link")
		.map((link) => ({
			name: link.textContent.replace(/\s+/g, " ").trim(),
			href: link.getAttribute("href"),
		}));
}

function groups(): string[][] {
	const found: string[][] = [[]];
	for (const element of document.querySelectorAll('a, [role="separator"]')) {
		if (element.getAttribute("role") === "separator") found.push([]);
		else
			found.at(-1)!.push(element.textContent.replace(/\s+/g, " ").trim());
	}
	return found;
}

beforeAll(async () => {
	await import("@testing-library/svelte");
	await import("./+page.svelte");
}, 90_000);

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	fake.reset();
});

afterEach(() => {
	testing.cleanup();
	vi.unstubAllEnvs();
});

describe("the app settings menu", () => {
	it("lists Language, the subscreens, then the privacy policy and the credits, under no headings", async () => {
		const screen = await opened({ capability: FDROID_BUILD });

		expect(rows()).toEqual([...SUBSCREENS, UPDATES, ...ABOUT]);
		expect(screen.queryAllByRole("heading")).toEqual([]);
	}, 60_000);

	it.each([
		{ capability: FDROID_BUILD, updates: ["Updates"] },
		{ capability: FOREIGN_SIGNER, updates: [] },
	])(
		"sets Language, the subscreens and the about rows apart, with $updates.length Updates rows",
		async ({ capability, updates }) => {
			await opened({ capability });

			expect(groups()).toEqual([
				["Language English"],
				[...SUBSCREENS.slice(1).map(({ name }) => name), ...updates],
				ABOUT.map(({ name }) => name),
			]);
		},
		60_000,
	);

	it.each([
		{ build: "a self-updating build", capability: SELF_UPDATING },
		{
			build: "a store build signed by Open Grind",
			capability: FDROID_BUILD,
			android: true,
		},
		{
			build: "a desktop build installed where it can’t update itself",
			capability: READ_ONLY_INSTALL,
		},
	])(
		"offers Updates on $build",
		async ({ capability, android = false }) => {
			await opened({ capability, android });

			expect(rows()).toEqual([...SUBSCREENS, UPDATES, ...ABOUT]);
		},
		60_000,
	);

	it.each([
		{
			build: "a build someone else signed",
			capability: FOREIGN_SIGNER,
			android: true,
		},
		{
			build: "a distribution package",
			capability: DISTRIBUTION_PACKAGE,
			android: false,
		},
	])(
		"leaves Updates out on $build",
		async ({ capability, android }) => {
			await opened({ capability, android });

			expect(rows()).toEqual([...SUBSCREENS, ...ABOUT]);
		},
		60_000,
	);

	it("keeps the Language row in a release build that offers only English", async () => {
		vi.stubEnv("DEV", false);
		const screen = await opened({ capability: FOREIGN_SIGNER });
		const { locales } = await import("$lib/i18n");

		expect(locales).toEqual(["en"]);
		expect(
			screen.getByRole("link", { name: "Language English" }),
		).toBeTruthy();
	}, 60_000);

	it("opens the privacy policy in the system browser", async () => {
		const screen = await opened({ capability: FOREIGN_SIGNER });

		screen.getByRole("link", { name: "Privacy policy" }).click();

		expect(linkOpener.openExternalLink).toHaveBeenCalledExactlyOnceWith(
			PRIVACY_POLICY,
		);
	}, 60_000);

	it("follows the active locale", async () => {
		const screen = await opened({ capability: FDROID_BUILD });
		const titles = screen
			.getAllByRole("link")
			.map(
				(link) =>
					link.querySelector<HTMLElement>(
						'[data-slot="item-title"]',
					) ?? link,
			);
		const { setLocale } = await import("$lib/i18n");

		await setLocale({ locale: "en-XA" });

		expect(titles).toHaveLength(SUBSCREENS.length + 1 + ABOUT.length);
		for (const title of titles) {
			expect(title.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	}, 60_000);
});
