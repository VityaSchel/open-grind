// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { createAttachmentKey } from "svelte/attachments";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Profile } from "#lib/model/users/profiles.ts";

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
vi.mock("#lib/api/users/profiles.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/users/profiles.ts")>()),
	getProfile: getProfileMock,
}));
vi.mock("#lib/chat/conversations-context.svelte.ts", () => ({
	getOrCreateConversationsState: () => ({ hasUnread: false }),
}));
vi.mock("#lib/interest/taps-state.svelte.ts", () => ({
	getTapsState: () => ({ hasUnseen: false }),
}));
vi.mock("#lib/util/media.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/util/media.ts")>()),
	profileMediaUrl: ({ mediaHash }: { mediaHash: string }) =>
		`https://cdn.test/${mediaHash}`,
}));

import { mergeProfileEditIntoCaches } from "#lib/api/users/profiles.ts";
import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { noteSoftKeyboardOpen } from "#lib/platform/soft-keyboard.svelte.ts";
import { runningOn } from "#lib/test/platform.ts";
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

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function tabNames() {
	const navigation = screen.getByRole("navigation");
	return {
		navigation: navigation.getAttribute("aria-label"),
		links: screen
			.getAllByRole("link")
			.map(
				(link) =>
					link.getAttribute("aria-label") ?? link.textContent.trim(),
			),
	};
}

describe("NavBar", () => {
	beforeEach(() => {
		getProfileMock.mockResolvedValue(profileWith(medias()));
	});

	it("names the main navigation and its tabs", () => {
		render(NavBar, { props: { ourProfileId: OUR_ID } });

		expect(tabNames()).toEqual({
			navigation: "Main",
			links: ["Browse", "Right Now", "Interest", "Inbox", "Me"],
		});
	});

	it("hands the attachments it is given to the navigation it renders", () => {
		const attached = vi.fn();
		render(NavBar, {
			props: { ourProfileId: OUR_ID, [createAttachmentKey()]: attached },
		});

		const navigation = screen.getByRole("navigation");
		expect(attached).toHaveBeenCalledExactlyOnceWith(navigation);
		expect(navigation.dataset.slot).toBe("navbar");
	});

	it("renames the navigation and its tabs when the locale changes", async () => {
		render(NavBar, { props: { ourProfileId: OUR_ID } });

		await setLocale({ locale: "en-XA" });

		const { navigation, links } = tabNames();
		expect(navigation).toMatch(PSEUDO_MESSAGE);
		expect(links).toHaveLength(5);
		for (const link of links) expect(link).toMatch(PSEUDO_MESSAGE);
	});

	describe("with a conversation open in the split view", () => {
		beforeEach(() => {
			page.route.id = "/(protected)/chat/[conversationId]";
		});

		afterEach(() => {
			page.route.id = "/(protected)/(navbar)/settings/(me)";
		});

		it("keeps Inbox as the current section and the resting Tab stop without lighting it up", async () => {
			render(NavBar, { props: { ourProfileId: OUR_ID } });
			const inbox = screen.getByRole("link", { name: "Inbox" });

			expect(
				screen
					.getAllByRole("link")
					.filter((link) => link.hasAttribute("aria-current")),
			).toEqual([inbox]);
			expect(inbox.getAttribute("aria-current")).toBe("page");
			expect(inbox.dataset.active).toBe("false");
			await vi.waitFor(() =>
				expect(inbox.getAttribute("tabindex")).toBe("0"),
			);
			expect(
				screen
					.getByRole("link", { name: "Browse" })
					.getAttribute("tabindex"),
			).toBe("-1");
		});
	});
});

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
	});

	it("steps aside while the keyboard shrinks the page and comes back once it closes", async () => {
		runningOn("android");
		render(NavBar, { props: { ourProfileId: OUR_ID } });
		const nav = screen.getByRole("navigation", { name: "Main" });
		expect(nav.hidden).toBe(false);

		noteSoftKeyboardOpen(true);
		await tick();
		expect(nav.hidden).toBe(true);

		noteSoftKeyboardOpen(false);
		await tick();
		expect(nav.hidden).toBe(false);
	});
});
