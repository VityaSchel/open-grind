// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileMock, dataRefreshControlMock } = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	dataRefreshControlMock: vi.fn(),
}));

vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
}));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/util/media", () => ({
	profileMediaUrl: ({
		mediaHash,
		size,
	}: {
		mediaHash: string;
		size: string;
	}) => `https://cdn.test/${size}/${mediaHash}`,
}));
vi.mock("$lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: dataRefreshControlMock,
}));

import { HiddenProfileError } from "$lib/api/users/profiles";
import { flush, fullProfile } from "./profile-pager-test-helpers";
import { gridRow, PROFILE_ID, renderPane } from "./profile-pane-test-helpers";

function inertElements(section: HTMLElement): HTMLElement[] {
	return [section, ...section.querySelectorAll<HTMLElement>("*")].filter(
		(element) => element.inert === true,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	getProfileMock.mockResolvedValue(fullProfile({ profileId: PROFILE_ID }));
});

afterEach(cleanup);

describe("ProfilePane roles", () => {
	it("puts the active pane's error screen in its main landmark", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({ active: true, row: null });
		await flush();

		const main = within(section).getByRole("main");
		expect(
			within(main).getByRole("button", { name: "Unhide" }),
		).not.toBeNull();
	});

	it("keeps a neighbor's error screen out of input", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({ active: false, row: null });
		await flush();

		const unhide = screen.getByRole("button", {
			name: "Unhide",
			hidden: true,
		});
		expect(section.getAttribute("aria-hidden")).toBe("true");
		expect(inertElements(section)).toEqual([section.firstElementChild]);
		expect(section.firstElementChild!.contains(unhide)).toBe(true);
	});

	it("keeps a neighbor that is not being left out of assistive tech and input while its scroller stays scrollable", async () => {
		const { section } = renderPane({
			active: false,
			row: gridRow(),
			position: 3,
		});
		await flush();

		const main = section.querySelector("main")!;
		const bottomBar = screen
			.getByRole("link", { name: "Write a message...", hidden: true })
			.closest("nav")!.parentElement!;
		expect(section.style.left).toBe("300%");
		expect(section.getAttribute("aria-hidden")).toBe("true");
		expect(inertElements(section)).toEqual([main, bottomBar]);
		expect(main.parentElement!.getAttribute("tabindex")).toBe("-1");
		expect(
			section.querySelector('[data-slot="profile-scroller"]'),
		).toBeNull();
		expect(dataRefreshControlMock).not.toHaveBeenCalled();
	});

	it("gives the active pane the scroller slot, live controls and the refresh control", async () => {
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		const scroller = section.querySelector("main")!.parentElement!;
		expect(section.hasAttribute("aria-hidden")).toBe(false);
		expect(inertElements(section)).toEqual([]);
		expect(scroller.getAttribute("data-slot")).toBe("profile-scroller");
		expect(scroller.hasAttribute("tabindex")).toBe(false);
		expect(
			screen.getByRole("link", { name: "Write a message..." }),
		).not.toBeNull();
		expect(dataRefreshControlMock).toHaveBeenCalledOnce();
	});

	it("locks the whole active pane, scroller included, while it is being left, without hiding it from assistive tech", async () => {
		const { section } = renderPane({
			active: true,
			leaving: true,
			row: gridRow(),
		});
		await flush();

		expect(inertElements(section)).toEqual([section]);
		expect(section.hasAttribute("aria-hidden")).toBe(false);
	});

	it("locks a neighbor's scroller too while the pager falls back from it", async () => {
		const { section } = renderPane({
			active: false,
			leaving: true,
			row: gridRow(),
		});
		await flush();

		const main = section.querySelector("main")!;
		const bottomBar = screen
			.getByRole("link", { name: "Write a message...", hidden: true })
			.closest("nav")!.parentElement!;
		expect(inertElements(section)).toEqual([section, main, bottomBar]);
	});

	it("locks an error screen that is being left", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({
			active: true,
			leaving: true,
			row: null,
		});
		await flush();

		expect(inertElements(section)).toEqual([section]);
	});
});
