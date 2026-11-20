// @vitest-environment jsdom

import { cleanup, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileMock, dataRefreshControlMock } = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	dataRefreshControlMock: vi.fn(),
}));

vi.mock("#lib/api/users/profiles.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/users/profiles.ts")>()),
	getProfile: getProfileMock,
}));
vi.mock("#lib/api/users/favorites.ts", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("#lib/util/media.ts", () => ({
	profileMediaUrl: ({
		mediaHash,
		size,
	}: {
		mediaHash: string;
		size: string;
	}) => `https://cdn.test/${size}/${mediaHash}`,
}));
vi.mock("#lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: dataRefreshControlMock,
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { Profile } from "#lib/model/users/profiles.ts";
import { flush, fullProfile, OUR_ID } from "./profile-pager-test-helpers";
import { gridRow, PROFILE_ID, renderPane } from "./profile-pane-test-helpers";

const NAV_CLEAR = "scroll-pb-nav-clear-above-safe-area";
const BAR_CLEAR = "scroll-pb-profile-bar-clear";

function scrollerOf(section: HTMLElement): HTMLElement {
	const scroller = section.querySelector<HTMLElement>(
		'[data-slot="profile-scroller"]',
	);
	if (scroller === null) throw new Error("no profile scroller");
	return scroller;
}

beforeEach(() => {
	vi.clearAllMocks();
	runningOn("windows");
});

afterEach(() => {
	cleanup();
	resetPlatform();
});

describe("ProfilePane scroll padding", () => {
	it("keeps keyboard reveals above the NavBar until the Chat and Tap bar shows, then above that bar", async () => {
		const loaded = Promise.withResolvers<Profile>();
		getProfileMock.mockReturnValueOnce(loaded.promise);
		const { section } = renderPane({ active: true, row: gridRow() });
		await tick();
		const scroller = scrollerOf(section);
		expect(scroller.classList).toContain(NAV_CLEAR);
		expect(scroller.classList).not.toContain(BAR_CLEAR);

		loaded.resolve(fullProfile({ profileId: PROFILE_ID }));
		await flush();

		expect(scroller.classList).toContain(BAR_CLEAR);
		expect(scroller.classList).not.toContain(NAV_CLEAR);
	});

	it("keeps keyboard reveals above the NavBar on our own profile", async () => {
		getProfileMock.mockResolvedValue(fullProfile({ profileId: OUR_ID }));
		const { section } = renderPane({
			active: true,
			row: null,
			profileId: OUR_ID,
		});
		await flush();

		const scroller = scrollerOf(section);
		expect(
			within(section).getByRole("heading", { level: 1, hidden: true }),
		).not.toBeNull();
		expect(scroller.classList).toContain(NAV_CLEAR);
		expect(scroller.classList).not.toContain(BAR_CLEAR);
	});
});
