// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addFavoriteUserMock, removeFavoriteUserMock } = vi.hoisted(() => ({
	addFavoriteUserMock: vi.fn<() => Promise<void>>(),
	removeFavoriteUserMock: vi.fn<() => Promise<void>>(),
}));

vi.mock("#lib/api/users/favorites.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/users/favorites.ts")>()),
	addFavoriteUser: addFavoriteUserMock,
	removeFavoriteUser: removeFavoriteUserMock,
}));
vi.mock("#lib/components/report/ReportSheet.svelte", () => ({
	default: vi.fn(),
}));
vi.mock("#lib/api/browse/blocks.ts", () => ({ blockUser: vi.fn() }));
vi.mock("#lib/api/browse/hides.ts", () => ({ hideUser: vi.fn() }));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));

import { touchEvent } from "#lib/components/feedback/refresh/pull-test-helpers.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { flush, fullProfile } from "../pager/profile-pager-test-helpers";
import ProfileTopNavBar from "./ProfileTopNavBar.svelte";

const PROFILE_ID = 100001;
const ROLLED_TAPS = [
	{ platform: "android", rollPx: 0, held: false },
	{ platform: "android", rollPx: 3, held: true },
	{ platform: "android", rollPx: 8, held: true },
	{ platform: "ios", rollPx: 0, held: false },
	{ platform: "ios", rollPx: 3, held: true },
	{ platform: "ios", rollPx: 9, held: true },
] as const;

function renderBar({ ourProfile = false }: { ourProfile?: boolean } = {}) {
	const onFavorite = vi.fn();
	render(ProfileTopNavBar, {
		props: {
			ourProfile,
			profile: ourProfile ? null : fullProfile({ profileId: PROFILE_ID }),
			changingViewability: false,
			markBlocked: vi.fn(),
			markHidden: vi.fn(),
			onFavorite,
		},
	});
	const nav = screen.getByRole("navigation", { name: "Profile actions" });
	return { nav, onFavorite };
}

function heldPull(on: Element): boolean {
	on.dispatchEvent(touchEvent("touchstart", { y: 100 }));
	const move = touchEvent("touchmove", { y: 140 });
	on.dispatchEvent(move);
	return move.defaultPrevented;
}

function touchPointer(type: "pointerdown" | "pointermove" | "pointerup") {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "pointerType", { value: "touch" });
	return event;
}

async function rolledTap({
	on,
	rollPx,
}: {
	on: Element;
	rollPx: number;
}): Promise<boolean> {
	const landing = { x: 20, y: 100 };
	const lifted = { x: landing.x, y: landing.y + rollPx };
	on.dispatchEvent(touchPointer("pointerdown"));
	on.dispatchEvent(touchEvent("touchstart", landing));
	on.dispatchEvent(touchPointer("pointermove"));
	on.dispatchEvent(touchEvent("touchmove", lifted));
	on.dispatchEvent(touchPointer("pointerup"));
	const end = touchEvent("touchend", lifted);
	on.dispatchEvent(end);
	await flush();
	on.dispatchEvent(
		new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
	);
	await flush();
	return end.defaultPrevented;
}

async function downwardDrag({ on, px }: { on: Element; px: number }) {
	const landing = { x: 20, y: 100 };
	on.dispatchEvent(touchPointer("pointerdown"));
	on.dispatchEvent(touchEvent("touchstart", landing));
	for (const y of [landing.y + 6, landing.y + px]) {
		on.dispatchEvent(touchPointer("pointermove"));
		on.dispatchEvent(touchEvent("touchmove", { x: landing.x, y }));
	}
	on.dispatchEvent(touchPointer("pointerup"));
	on.dispatchEvent(
		touchEvent("touchend", { x: landing.x, y: landing.y + px }),
	);
	await flush();
}

beforeEach(() => {
	vi.clearAllMocks();
	addFavoriteUserMock.mockResolvedValue(undefined);
	runningOn("windows");
});

afterEach(() => {
	cleanup();
	resetPlatform();
});

describe("the profile actions bar", () => {
	it.each(["android", "ios"] as const)(
		"keeps a pull anywhere on it from refreshing or moving the profile on %s",
		(platform) => {
			runningOn(platform);
			const { nav } = renderBar();

			expect(nav.hasAttribute("data-refresh-no-pull")).toBe(true);
			expect(heldPull(nav)).toBe(true);
			expect(
				heldPull(
					within(nav).getByRole("switch", {
						name: "Add to favorites",
					}),
				),
			).toBe(true);
			expect(
				heldPull(
					within(nav).getByRole("button", { name: "Profile menu" }),
				),
			).toBe(true);
		},
	);

	it.each(["android", "ios"] as const)(
		"keeps a pull on Edit profile from refreshing or moving our own profile on %s",
		(platform) => {
			runningOn(platform);
			const { nav } = renderBar({ ourProfile: true });

			expect(
				heldPull(
					within(nav).getByRole("link", { name: "Edit profile" }),
				),
			).toBe(true);
		},
	);

	it.each(["linux", "macos", "windows"] as const)(
		"lets a drag on it move the profile as usual on %s",
		(platform) => {
			runningOn(platform);
			const { nav } = renderBar();

			expect(heldPull(nav)).toBe(false);
			expect(
				heldPull(
					within(nav).getByRole("switch", {
						name: "Add to favorites",
					}),
				),
			).toBe(false);
		},
	);

	it.each(ROLLED_TAPS)(
		"stars the profile once for a tap on $platform that rolls $rollPx px down",
		async ({ platform, rollPx, held }) => {
			runningOn(platform);
			const { nav, onFavorite } = renderBar();
			const star = within(nav).getByRole("switch", {
				name: "Add to favorites",
			});

			expect(await rolledTap({ on: star, rollPx })).toBe(held);

			expect(addFavoriteUserMock).toHaveBeenCalledExactlyOnceWith({
				profileId: PROFILE_ID,
			});
			expect(removeFavoriteUserMock).not.toHaveBeenCalled();
			expect(onFavorite).toHaveBeenCalledExactlyOnceWith(true);
		},
	);

	it.each(ROLLED_TAPS)(
		"opens the profile menu once, and leaves it open, for a tap on $platform that rolls $rollPx px down",
		async ({ platform, rollPx, held }) => {
			runningOn(platform);
			const { nav } = renderBar();
			const menu = within(nav).getByRole("button", {
				name: "Profile menu",
			});

			expect(await rolledTap({ on: menu, rollPx })).toBe(held);

			expect(menu.getAttribute("aria-expanded")).toBe("true");
			expect(
				await screen.findAllByRole("menuitem", { hidden: true }),
			).toHaveLength(4);
		},
	);

	it.each(["android", "ios"] as const)(
		"leaves the profile menu shut after a downward drag that starts on it on %s",
		async (platform) => {
			runningOn(platform);
			const { nav } = renderBar();
			const menu = within(nav).getByRole("button", {
				name: "Profile menu",
			});

			await downwardDrag({ on: menu, px: 200 });

			expect(menu.getAttribute("aria-expanded")).toBe("false");
			expect(
				screen.queryAllByRole("menuitem", { hidden: true }),
			).toHaveLength(0);
		},
	);

	it("follows Edit profile once for a tap on iOS that rolls a few px down", async () => {
		runningOn("ios");
		const { nav } = renderBar({ ourProfile: true });
		const link = within(nav).getByRole("link", { name: "Edit profile" });
		const follows: MouseEvent[] = [];
		link.addEventListener("click", (event) => {
			event.preventDefault();
			follows.push(event);
		});

		expect(await rolledTap({ on: link, rollPx: 6 })).toBe(true);

		expect(follows).toHaveLength(1);
	});
});
