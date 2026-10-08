// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getProfileMock,
	dataRefreshControlMock,
	hideUserMock,
	unhideUserMock,
	blockUserMock,
	unblockUserMock,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	dataRefreshControlMock: vi.fn(),
	hideUserMock: vi.fn(),
	unhideUserMock: vi.fn(),
	blockUserMock: vi.fn(),
	unblockUserMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/browse/hides", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/browse/hides")>()),
	hideUser: hideUserMock,
	unhideUser: unhideUserMock,
}));
vi.mock("$lib/api/browse/blocks", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/browse/blocks")>()),
	blockUser: blockUserMock,
	unblockUser: unblockUserMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

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
import {
	BlockedProfileError,
	HiddenProfileError,
} from "$lib/api/users/profiles";
import type { Profile } from "$lib/model/users/profiles";
import { flush, fullProfile, OUR_ID } from "./profile-pager-test-helpers";
import {
	gridRow,
	PROFILE_ID,
	renderPane,
	ROW_HASH,
} from "./profile-pane-test-helpers";

const SECOND_HASH = "secondphoto";

const LOADED = {
	profileId: PROFILE_ID,
	displayName: "Loaded",
	age: 30,
	mediaHashes: [ROW_HASH, SECOND_HASH],
};

function serviceUnavailable(): ApiError {
	return new ApiError({
		message: "Service Unavailable",
		request: { method: "GET", path: `/v7/profiles/${PROFILE_ID}` },
		response: { status: 503, body: "" },
		kind: "Http",
	});
}

function headingElement(section: HTMLElement): HTMLElement | null {
	return within(section).queryByRole("heading", { level: 1, hidden: true });
}

function heading(section: HTMLElement): string | undefined {
	return headingElement(section)
		?.textContent.replace(/\s+/g, " ")
		.replace(" ,", ",")
		.trim();
}

function photoSources(section: HTMLElement): (string | null)[] {
	return [...section.querySelectorAll(".carousel img")].map((image) =>
		image.getAttribute("src"),
	);
}

function pendingRequest(request: ReturnType<typeof vi.fn>) {
	const response = Promise.withResolvers<void>();
	request.mockReturnValueOnce(response.promise);
	return response;
}

function button(name: string): HTMLButtonElement {
	return screen.getByRole<HTMLButtonElement>("button", { name });
}

async function chooseFromProfileMenu(name: string) {
	await fireEvent.keyDown(button("Profile menu"), { key: "Enter" });
	const items = await screen.findAllByRole("menuitem", { hidden: true });
	await fireEvent.click(
		items.find((item) => item.textContent.trim() === name)!,
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
			active: false,
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
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await flush();

		expect(getProfileMock).toHaveBeenCalledTimes(2);
		expect(heading(section)).toBe("Loaded, 30");
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	});

	it("shows the full error screen for a failed load with no grid row", async () => {
		getProfileMock.mockRejectedValue(serviceUnavailable());
		const { section } = renderPane({ active: true, row: null });
		await flush();

		expect(screen.getByText("Couldn't reach the server")).not.toBeNull();
		expect(headingElement(section)).toBeNull();
		expect(section.querySelector(".carousel")).toBeNull();
	});

	it("shows the hidden screen instead of the row photo for a hidden profile", async () => {
		getProfileMock.mockRejectedValue(new HiddenProfileError());
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		expect(screen.getByText("You hid this profile.")).not.toBeNull();
		expect(section.querySelector("img")).toBeNull();
		expect(headingElement(section)).toBeNull();
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
		const { section } = renderPane({ active: false, row: gridRow() });
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
		const { section } = renderPane({ active: true, row: gridRow() });
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
		const { section } = renderPane({ active: true, row: null });
		await tick();

		const photoSlot = section.querySelector("main")!.firstElementChild!;
		expect(headingElement(section)).toBeNull();
		expect(section.querySelector(".carousel")).toBeNull();
		expect(photoSlot.getAttribute("data-slot")).toBe("skeleton");
		expect(
			photoSlot.nextElementSibling!.querySelector(
				'[data-slot="skeleton"]',
			),
		).not.toBeNull();
	});
});

describe("ProfilePane profile actions", () => {
	it("offers Edit profile on our own pane while it loads", async () => {
		getProfileMock.mockReturnValueOnce(new Promise(() => {}));
		const { section } = renderPane({
			active: true,
			row: null,
			profileId: OUR_ID,
		});
		await tick();

		expect(headingElement(section)).toBeNull();
		expect(
			screen
				.getByRole("link", { name: "Edit profile" })
				.getAttribute("href"),
		).toBe("/settings/profile");
	});

	it("keeps the same Edit profile link when our own profile loads", async () => {
		const loaded = Promise.withResolvers<Profile>();
		getProfileMock.mockReturnValueOnce(loaded.promise);
		const { section } = renderPane({
			active: true,
			row: null,
			profileId: OUR_ID,
		});
		await tick();
		const loadingLink = screen.getByRole("link", { name: "Edit profile" });

		loaded.resolve(
			fullProfile({ profileId: OUR_ID, displayName: "Me", age: 30 }),
		);
		await flush();

		expect(heading(section)).toBe("Me, 30");
		expect(screen.getByRole("link", { name: "Edit profile" })).toBe(
			loadingLink,
		);
	});

	it("keeps the same Edit profile link through a failed load and its retry", async () => {
		getProfileMock.mockRejectedValueOnce(serviceUnavailable());
		getProfileMock.mockResolvedValueOnce(
			fullProfile({ profileId: OUR_ID, displayName: "Me", age: 30 }),
		);
		const { section } = renderPane({
			active: true,
			row: gridRow({ id: OUR_ID }),
			profileId: OUR_ID,
		});
		await flush();
		const failedLink = screen.getByRole("link", { name: "Edit profile" });

		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await flush();

		expect(heading(section)).toBe("Me, 30");
		expect(screen.getByRole("link", { name: "Edit profile" })).toBe(
			failedLink,
		);
	});

	it("leaves Edit profile off the full error screen of our own profile", async () => {
		getProfileMock.mockRejectedValue(serviceUnavailable());
		renderPane({ active: true, row: null, profileId: OUR_ID });
		await flush();

		expect(screen.getByText("Couldn't reach the server")).not.toBeNull();
		expect(
			screen.queryByRole("navigation", { name: "Profile actions" }),
		).toBeNull();
	});

	it("reaches a favorite's note before the profile actions", async () => {
		const favorite = { ...fullProfile(LOADED), isFavorite: true };
		getProfileMock.mockResolvedValue(favorite);
		const { profileState } = renderPane({ active: true, row: gridRow() });
		await flush();
		profileState.setNote({ notes: "Met at the gym", phoneNumber: "" });
		await tick();

		const controls = screen.getAllByRole("button");
		const note = screen.getByRole("button", { name: "Met at the gym" });
		const menu = screen.getByRole("button", { name: "Profile menu" });
		expect(controls.indexOf(note)).toBeLessThan(controls.indexOf(menu));
	});

	it("holds someone else's profile actions back until the profile loads", async () => {
		const loaded = Promise.withResolvers<Profile>();
		getProfileMock.mockReturnValueOnce(loaded.promise);
		renderPane({ active: true, row: gridRow() });
		await tick();
		expect(
			screen.queryByRole("navigation", { name: "Profile actions" }),
		).toBeNull();

		loaded.resolve(fullProfile(LOADED));
		await flush();

		const actions = within(
			screen.getByRole("navigation", { name: "Profile actions" }),
		);
		expect(
			actions.getByRole("switch", { name: "Add to favorites" }),
		).not.toBeNull();
		expect(
			actions.getByRole("button", { name: "Profile menu" }),
		).not.toBeNull();
		expect(
			actions.queryByRole("link", { name: "Edit profile" }),
		).toBeNull();
	});
});

describe("ProfilePane hiding and blocking", () => {
	it("shows the hidden screen while the hide request is in flight, with Unhide waiting for it", async () => {
		const hide = pendingRequest(hideUserMock);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		await chooseFromProfileMenu("Hide profile");

		expect(hideUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(
			within(section).getByText("You hid this profile."),
		).not.toBeNull();
		expect(button("Unhide").disabled).toBe(true);

		hide.resolve();
		await flush();

		expect(button("Unhide").disabled).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("brings the profile back and reports the failure when the hide is rejected", async () => {
		const hide = pendingRequest(hideUserMock);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();
		await chooseFromProfileMenu("Hide profile");
		const rejection = new Error("offline");

		hide.reject(rejection);
		await flush();

		expect(within(section).queryByText("You hid this profile.")).toBeNull();
		expect(heading(section)).toBe("Loaded, 30");
		expect(button("Profile menu").disabled).toBe(false);
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to hide user",
			error: rejection,
		});
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("shows the blocked screen while the block request is in flight and takes it back on failure", async () => {
		const block = pendingRequest(blockUserMock);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		await chooseFromProfileMenu("Block profile");

		expect(
			within(section).getByText("You have blocked this profile."),
		).not.toBeNull();
		expect(button("Unblock").disabled).toBe(false);

		const rejection = new Error("offline");
		block.reject(rejection);
		await flush();

		expect(heading(section)).toBe("Loaded, 30");
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to block user",
			error: rejection,
		});
	});

	it("unblocks right away while the block is still on its way, without reporting the block", async () => {
		const block = pendingRequest(blockUserMock);
		const unblock = pendingRequest(unblockUserMock);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();
		await chooseFromProfileMenu("Block profile");

		await fireEvent.click(button("Unblock"));
		await flush();
		expect(heading(section)).toBe("Loaded, 30");

		block.resolve();
		await flush();
		expect(
			button("Profile menu").disabled,
			"the unblock is still on its way",
		).toBe(true);

		unblock.resolve();
		await flush();

		expect(heading(section)).toBe("Loaded, 30");
		expect(button("Profile menu").disabled).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("blocks a profile Grindr marks as non-blockable like any other", async () => {
		getProfileMock.mockResolvedValue({
			...fullProfile(LOADED),
			isBlockable: false,
		});
		blockUserMock.mockResolvedValueOnce(undefined);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();

		await chooseFromProfileMenu("Block profile");
		await flush();

		expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(
			within(section).getByText("You have blocked this profile."),
		).not.toBeNull();
	});

	it("shows the profile again at once on Unhide and holds its menu until the request lands", async () => {
		hideUserMock.mockResolvedValueOnce(undefined);
		const unhide = pendingRequest(unhideUserMock);
		const { section } = renderPane({ active: true, row: gridRow() });
		await flush();
		await chooseFromProfileMenu("Hide profile");
		await flush();

		await fireEvent.click(button("Unhide"));

		expect(heading(section)).toBe("Loaded, 30");
		expect(button("Profile menu").disabled).toBe(true);

		unhide.resolve();
		await flush();

		expect(button("Profile menu").disabled).toBe(false);
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("loads a profile blocked on the server only once the unblock lands", async () => {
		getProfileMock.mockRejectedValueOnce(
			new BlockedProfileError({ blockedByUs: true }),
		);
		const unblock = pendingRequest(unblockUserMock);
		const { section } = renderPane({ active: true, row: null });
		await flush();

		await fireEvent.click(button("Unblock"));

		expect(screen.queryByText("You have blocked this profile.")).toBeNull();
		expect(getProfileMock).toHaveBeenCalledOnce();

		unblock.resolve();
		await flush();

		expect(getProfileMock).toHaveBeenCalledTimes(2);
		expect(heading(section)).toBe("Loaded, 30");
	});

	it("puts the blocked screen back and reports the failure when the unblock is rejected", async () => {
		getProfileMock.mockRejectedValueOnce(
			new BlockedProfileError({ blockedByUs: true }),
		);
		const unblock = pendingRequest(unblockUserMock);
		renderPane({ active: true, row: null });
		await flush();
		await fireEvent.click(button("Unblock"));
		const rejection = new Error("offline");

		unblock.reject(rejection);
		await flush();

		expect(button("Unblock").disabled).toBe(false);
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to unblock user",
			error: rejection,
		});
		expect(getProfileMock).toHaveBeenCalledOnce();
	});
});
