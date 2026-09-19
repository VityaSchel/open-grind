// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
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

import { ApiError } from "$lib/api/api-error";
import { HiddenProfileError } from "$lib/api/users/profiles";
import type { RenderedGridProfile } from "$lib/grid/grid";
import type { Profile } from "$lib/model/users/profiles";
import { ProfileState } from "../profile-state.svelte";
import { fullProfile } from "./profile-pager-test-helpers";
import ProfilePane from "./ProfilePane.svelte";

const PROFILE_ID = 100001;
const OUR_ID = 42;
const ROW_HASH = "rowphoto";
const SECOND_HASH = "secondphoto";

const LOADED = {
	profileId: PROFILE_ID,
	displayName: "Loaded",
	age: 30,
	mediaHashes: [ROW_HASH, SECOND_HASH],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function gridRow(): RenderedGridProfile {
	return {
		type: "rendered",
		id: PROFILE_ID,
		displayName: "Peer",
		age: 27,
		distance: null,
		profilePhotosHashes: [ROW_HASH],
		unread: null,
		onlineUntil: null,
		seen: null,
		isFavorite: false,
		isVisiting: false,
		hasChattedInLast24Hrs: false,
	};
}

function serviceUnavailable(): ApiError {
	return new ApiError({
		message: "Service Unavailable",
		request: { method: "GET", path: `/v7/profiles/${PROFILE_ID}` },
		response: { status: 503, body: "" },
		kind: "Http",
	});
}

function renderPane({
	role,
	row,
	position = 0,
}: {
	role: "active" | "neighbor";
	row: RenderedGridProfile | null;
	position?: number;
}) {
	const profileState = new ProfileState({
		profileId: PROFILE_ID,
		ourProfileId: OUR_ID,
	});
	const { container } = render(ProfilePane, {
		props: {
			profileState,
			position,
			role,
			row,
			heroHash: row?.profilePhotosHashes?.[0] ?? null,
		},
	});
	const section = container.querySelector<HTMLElement>(
		'[data-slot="profile-pane"]',
	)!;
	return { profileState, section };
}

function heading(section: HTMLElement): string | undefined {
	return section
		.querySelector("h1")
		?.textContent.replace(/\s+/g, " ")
		.replace(" ,", ",")
		.trim();
}

function inertElements(section: HTMLElement): HTMLElement[] {
	return [section, ...section.querySelectorAll<HTMLElement>("*")].filter(
		(element) => element.inert === true,
	);
}

function photoSources(section: HTMLElement): (string | null)[] {
	return [...section.querySelectorAll(".carousel img")].map((image) =>
		image.getAttribute("src"),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	getProfileMock.mockResolvedValue(fullProfile(LOADED));
});

afterEach(cleanup);

describe("ProfilePane failures", () => {
	it("keeps a neighbor's row photo and heading behind a retry control when its load fails", async () => {
		getProfileMock.mockRejectedValue(serviceUnavailable());
		const { profileState, section } = renderPane({
			role: "neighbor",
			row: gridRow(),
		});
		await flush();

		expect(profileState.error).toBeInstanceOf(ApiError);
		expect(photoSources(section)).toEqual([
			`https://cdn.test/full/${ROW_HASH}`,
		]);
		expect(heading(section)).toBe("Peer, 27");
		expect(
			screen.getByRole("button", { name: "Retry", hidden: true }),
		).not.toBeNull();
		expect(screen.queryByText("Couldn't reach the server")).toBeNull();
	});

	it("loads the profile again from the retry control", async () => {
		getProfileMock.mockRejectedValueOnce(serviceUnavailable());
		const { section } = renderPane({ role: "active", row: gridRow() });
		await flush();

		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await flush();

		expect(getProfileMock).toHaveBeenCalledTimes(2);
		expect(heading(section)).toBe("Loaded, 30");
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	});

	it("shows the full error screen for a failed load with no grid row", async () => {
		getProfileMock.mockRejectedValue(serviceUnavailable());
		const { section } = renderPane({ role: "active", row: null });
		await flush();

		expect(screen.getByText("Couldn't reach the server")).not.toBeNull();
		expect(section.querySelector("h1")).toBeNull();
		expect(section.querySelector(".carousel")).toBeNull();
	});

	it("shows the hidden screen instead of the row photo for a hidden profile", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({ role: "active", row: gridRow() });
		await flush();

		expect(screen.getByText("You hid this profile.")).not.toBeNull();
		expect(section.querySelector("img")).toBeNull();
		expect(section.querySelector("h1")).toBeNull();
	});
});

describe("ProfilePane loading", () => {
	it("keeps the row photo element when the full profile loads over it", async () => {
		let settle: (profile: Profile) => void = () => {};
		getProfileMock.mockReturnValueOnce(
			new Promise<Profile>((resolve) => {
				settle = resolve;
			}),
		);
		const { section } = renderPane({ role: "neighbor", row: gridRow() });
		await tick();
		const rowPhoto = section.querySelector(".carousel img");
		expect(rowPhoto?.getAttribute("src")).toBe(
			`https://cdn.test/full/${ROW_HASH}`,
		);
		expect(heading(section)).toBe("Peer, 27");

		settle(fullProfile(LOADED));
		await flush();

		expect(photoSources(section)).toEqual([
			`https://cdn.test/full/${ROW_HASH}`,
			`https://cdn.test/full/${SECOND_HASH}`,
		]);
		expect(section.querySelector(".carousel img")).toBe(rowPhoto);
		expect(heading(section)).toBe("Loaded, 30");
	});

	it("previews the row without the loaded profile's status slots", async () => {
		getProfileMock.mockReturnValueOnce(new Promise(() => {}));
		const { section } = renderPane({ role: "active", row: gridRow() });
		await tick();

		expect(
			section.querySelector('[data-slot="profile-preview-status"]'),
		).not.toBeNull();
		expect(
			section.querySelector(
				'[data-slot="profile-status-row"], [data-slot="new-badge"]',
			),
		).toBeNull();
	});

	it("shows a skeleton with no photo for a loading pane with no row", async () => {
		getProfileMock.mockReturnValueOnce(new Promise(() => {}));
		const { section } = renderPane({ role: "active", row: null });
		await tick();

		const photoSlot = section.querySelector("main")!.firstElementChild!;
		expect(section.querySelector("h1")).toBeNull();
		expect(section.querySelector(".carousel")).toBeNull();
		expect(photoSlot.getAttribute("data-slot")).toBe("skeleton");
		expect(
			photoSlot.nextElementSibling!.querySelector(
				'[data-slot="skeleton"]',
			),
		).not.toBeNull();
	});
});

describe("ProfilePane roles", () => {
	it("keeps a neighbor's error screen out of input", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({ role: "neighbor", row: null });
		await flush();

		const unhide = screen.getByRole("button", {
			name: "Unhide",
			hidden: true,
		});
		expect(section.getAttribute("aria-hidden")).toBe("true");
		expect(inertElements(section)).toEqual([section.firstElementChild]);
		expect(section.firstElementChild!.contains(unhide)).toBe(true);
	});

	it("keeps a neighbor out of assistive tech and input while its scroller stays scrollable", async () => {
		const { section } = renderPane({
			role: "neighbor",
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
		const { section } = renderPane({ role: "active", row: gridRow() });
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
});
