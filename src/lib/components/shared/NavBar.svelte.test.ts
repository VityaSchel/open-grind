// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "$lib/model/users/profiles";

const OUR_ID = 100;
const OTHER_ID = 200;

const { getProfileMock, page } = vi.hoisted(() => ({
	getProfileMock: vi.fn<(profileId: number) => Promise<Profile>>(),
	page: {
		url: new URL("https://app.test/settings"),
		route: { id: "/(protected)/(navbar)/settings/(me)" },
	},
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
}));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getOrCreateConversationsState: () => ({ hasUnread: false }),
}));
vi.mock("$lib/interest/taps-state.svelte", () => ({
	getTapsState: () => ({ hasUnseen: false }),
}));
vi.mock("$lib/util/media", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/util/media")>()),
	profileMediaUrl: ({ mediaHash }: { mediaHash: string }) =>
		`https://cdn.test/${mediaHash}`,
}));

import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import {
	notePageFollowsSoftKeyboard,
	noteSoftKeyboardOpen,
} from "$lib/platform/soft-keyboard.svelte";
import { runningOn } from "$lib/test/platform";
import NavBar from "./NavBar.svelte";

function medias(...mediaHashes: string[]): Profile["medias"] {
	return mediaHashes.map((mediaHash) => ({
		mediaHash,
		type: 0,
		state: 1,
		reason: null,
		takenOnGrindr: false,
		createdAt: 0,
	}));
}

function profileWith(photos: Profile["medias"]): Profile {
	return { profileId: OUR_ID, medias: photos } as unknown as Profile;
}

function avatarSrc(container: HTMLElement): string | null {
	return (
		container
			.querySelector('a[aria-label="Me"] img')
			?.getAttribute("src") ?? null
	);
}

function mainNav(container: HTMLElement): HTMLElement {
	const nav = container.querySelector<HTMLElement>('nav[aria-label="Main"]');
	if (!nav) throw new Error("the main nav is not rendered");
	return nav;
}

async function renderedAvatar(container: HTMLElement): Promise<string | null> {
	return await vi.waitFor(() => {
		const src = avatarSrc(container);
		if (src === null) throw new Error("avatar not rendered yet");
		return src;
	});
}

beforeEach(() => {
	getProfileMock.mockReset();
	runningOn("windows");
});

afterEach(() => cleanup());

describe("navbar avatar", () => {
	it("shows the new main photo once our profile photos are saved", async () => {
		getProfileMock.mockResolvedValue(profileWith(medias("first")));
		const { container } = render(NavBar, {
			props: { ourProfileId: OUR_ID },
		});
		expect(await renderedAvatar(container)).toBe("https://cdn.test/first");

		mergeProfileEditIntoCaches({
			cacheProfileId: OUR_ID,
			patch: { medias: medias("second", "first") },
		});

		await vi.waitFor(() =>
			expect(avatarSrc(container)).toBe("https://cdn.test/second"),
		);
		expect(getProfileMock).toHaveBeenCalledTimes(1);
	});

	it("ignores photo edits to another profile", async () => {
		getProfileMock.mockResolvedValue(profileWith(medias("first")));
		const { container } = render(NavBar, {
			props: { ourProfileId: OUR_ID },
		});
		expect(await renderedAvatar(container)).toBe("https://cdn.test/first");

		mergeProfileEditIntoCaches({
			cacheProfileId: OTHER_ID,
			patch: { medias: medias("theirs") },
		});
		await tick();

		expect(avatarSrc(container)).toBe("https://cdn.test/first");
	});

	it("keeps the saved photos when the first profile fetch answers later", async () => {
		const { promise, resolve } = Promise.withResolvers<Profile>();
		getProfileMock.mockReturnValue(promise);
		const { container } = render(NavBar, {
			props: { ourProfileId: OUR_ID },
		});
		await tick();

		mergeProfileEditIntoCaches({
			cacheProfileId: OUR_ID,
			patch: { medias: medias("saved") },
		});
		expect(await renderedAvatar(container)).toBe("https://cdn.test/saved");

		resolve(profileWith(medias("stale")));
		await promise;
		await tick();

		expect(avatarSrc(container)).toBe("https://cdn.test/saved");
	});
});

describe("navbar under the soft keyboard", () => {
	beforeEach(() => {
		getProfileMock.mockResolvedValue(profileWith(medias("first")));
	});

	afterEach(() => {
		noteSoftKeyboardOpen(false);
		notePageFollowsSoftKeyboard(false);
	});

	it.each(["android", "ios"] as const)(
		"steps aside on %s while the keyboard shrinks the page and comes back once it closes",
		async (platform) => {
			runningOn(platform);
			const { container } = render(NavBar, {
				props: { ourProfileId: OUR_ID },
			});
			expect(mainNav(container).hidden).toBe(false);

			noteSoftKeyboardOpen(true);
			await tick();
			expect(mainNav(container).hidden).toBe(true);

			noteSoftKeyboardOpen(false);
			await tick();
			expect(mainNav(container).hidden).toBe(false);
		},
	);

	it("stays on ios while a conversation follows the keyboard", async () => {
		runningOn("ios");
		const { container } = render(NavBar, {
			props: { ourProfileId: OUR_ID },
		});

		notePageFollowsSoftKeyboard(true);
		noteSoftKeyboardOpen(true);
		await tick();

		expect(mainNav(container).hidden).toBe(false);
	});

	it.each(["linux", "macos", "windows"] as const)(
		"stays on %s",
		async (platform) => {
			runningOn(platform);
			const { container } = render(NavBar, {
				props: { ourProfileId: OUR_ID },
			});

			noteSoftKeyboardOpen(true);
			await tick();

			expect(mainNav(container).hidden).toBe(false);
		},
	);
});
