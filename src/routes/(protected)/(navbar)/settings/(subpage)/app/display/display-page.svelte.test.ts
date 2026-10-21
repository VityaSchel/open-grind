// @vitest-environment jsdom

import { encode } from "@msgpack/msgpack";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform, desktopEntry } = vi.hoisted(() => ({
	platform: {
		isAndroidPlatform: vi.fn(() => false),
		isMacosPlatform: vi.fn(() => false),
	},
	desktopEntry: { available: false },
}));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	...platform,
}));
vi.mock("$lib/platform/desktop-entry.svelte", () => ({
	desktopEntryAvailable: () => desktopEntry.available,
	desktopEntryInstalled: () => false,
	setDesktopEntryInstalled: vi.fn(),
}));

import DisplayPage from "./+page.svelte";

const units = () => screen.getByRole("radio", { name: "Metric" });
const blur = () => screen.getByRole("slider", { name: "Background blur" });
const haptics = () =>
	screen.queryByRole("switch", { name: /^Haptic feedback/ });
const appsMenu = () =>
	screen.queryByRole("switch", { name: /^Show in apps menu/ });

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
	platform.isAndroidPlatform.mockReturnValue(false);
	platform.isMacosPlatform.mockReturnValue(false);
	desktopEntry.available = false;
});

afterEach(cleanup);

describe("the Display settings", () => {
	it.each([
		{ os: "Android", android: true, macos: false, entry: false },
		{ os: "macOS", android: false, macos: true, entry: false },
		{
			os: "Linux with an apps menu",
			android: false,
			macos: false,
			entry: true,
		},
		{ os: "Windows", android: false, macos: false, entry: false },
	])(
		"offer units and blur on $os, with haptics only where it has them and the apps menu entry only where it has one",
		({ android, macos, entry }) => {
			platform.isAndroidPlatform.mockReturnValue(android);
			platform.isMacosPlatform.mockReturnValue(macos);
			desktopEntry.available = entry;

			render(DisplayPage);

			expect(inDocumentOrder([units(), blur()])).toBe(true);
			expect(haptics() !== null).toBe(android || macos);
			expect(appsMenu() !== null).toBe(entry);
			expect(screen.queryAllByRole("heading")).toEqual([]);
		},
	);

	it("keep units, blur, haptic feedback and the apps menu entry in that order", () => {
		platform.isAndroidPlatform.mockReturnValue(true);
		desktopEntry.available = true;

		render(DisplayPage);

		expect(inDocumentOrder([units(), blur(), haptics(), appsMenu()])).toBe(
			true,
		);
	});
});
