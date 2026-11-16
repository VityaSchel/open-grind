// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopEntry } = vi.hoisted(() => ({
	desktopEntry: { available: false },
}));

vi.mock("#lib/app-data/index.ts", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));
vi.mock("#lib/platform/desktop-entry.svelte.ts", () => ({
	desktopEntryAvailable: () => desktopEntry.available,
	desktopEntryInstalled: () => false,
	setDesktopEntryInstalled: vi.fn(),
}));
vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import {
	hydratePreferences,
	preferencesSnapshot,
} from "#lib/app-data/preferences.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import DisplayPage from "./+page.svelte";

const units = () => screen.getByRole("radio", { name: "Metric" });
const blur = () => screen.getByRole("slider", { name: "Background blur" });
const haptics = () =>
	screen.queryByRole("switch", { name: /^Haptic feedback/ });
const appsMenu = () =>
	screen.queryByRole("switch", { name: /^Show in apps menu/ });
const matureContent = () =>
	screen.queryByRole("switch", { name: /^Show mature content/ });

function inDocumentOrder(elements: (HTMLElement | null)[]): boolean {
	return elements.every(
		(element, index) =>
			element !== null &&
			(index === 0 ||
				(elements[index - 1]!.compareDocumentPosition(element) &
					Node.DOCUMENT_POSITION_FOLLOWING) !==
					0),
	);
}

beforeEach(() => {
	runningOn("linux");
	desktopEntry.available = false;
});

afterEach(() => {
	cleanup();
	resetPlatform();
});

describe("the Display settings", () => {
	it.each([
		{ os: "Android", platform: "android", vibrates: true, entry: false },
		{ os: "iOS", platform: "ios", vibrates: true, entry: false },
		{ os: "macOS", platform: "macos", vibrates: true, entry: false },
		{
			os: "Linux with an apps menu",
			platform: "linux",
			vibrates: false,
			entry: true,
		},
		{ os: "Windows", platform: "windows", vibrates: false, entry: false },
	] as const)(
		"offer units and blur on $os, with haptics only where it has them and the apps menu entry only where it has one",
		({ platform, vibrates, entry }) => {
			runningOn(platform);
			desktopEntry.available = entry;

			render(DisplayPage);

			expect(inDocumentOrder([units(), blur()])).toBe(true);
			expect(haptics() !== null).toBe(vibrates);
			expect(appsMenu() !== null).toBe(entry);
			expect(screen.queryAllByRole("heading")).toEqual([]);
		},
	);

	it("keep units, blur, haptic feedback and the apps menu entry in that order", () => {
		runningOn("android");
		desktopEntry.available = true;

		render(DisplayPage);

		expect(inDocumentOrder([units(), blur(), haptics(), appsMenu()])).toBe(
			true,
		);
	});
});

describe("the mature content switch of the Display settings", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("comes first on the Google Play build for the gated account and goes away for good once flipped", async () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		await hydratePreferences();
		render(DisplayPage);
		const matureContentSwitch = matureContent();
		expect(
			matureContentSwitch?.closest("#show-mature-content"),
		).not.toBeNull();
		expect(inDocumentOrder([matureContentSwitch, units()])).toBe(true);

		await fireEvent.click(matureContentSwitch!);

		await waitFor(() => expect(matureContent()).toBeNull());
		expect(preferencesSnapshot().showMatureContent).toBe(true);
	});

	it("never shows on any other build", () => {
		render(DisplayPage);

		expect(matureContent()).toBeNull();
	});
});
