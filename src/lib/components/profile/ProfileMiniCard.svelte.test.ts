// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { untranslatableTexts } from "$lib/test/untranslatable";
import ProfileMiniCard from "./ProfileMiniCard.svelte";

const HREF = "/profile/1";

function unreadBadge() {
	return screen.getByText("unread messages").parentElement!;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});

afterEach(async () => {
	cleanup();
	vi.useRealTimers();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ProfileMiniCard", () => {
	it("shows the online indicator for a profile without a display name", () => {
		render(ProfileMiniCard, {
			displayName: null,
			onlineUntil: Date.now() + 60_000,
			href: HREF,
		});

		expect(screen.getByTitle("Online now")).toBeTruthy();
		expect(screen.getByText("Someone")).toBeTruthy();
	});

	it("names the profile when it has a display name", () => {
		render(ProfileMiniCard, { displayName: "Simon", href: HREF });

		expect(screen.getByText("Simon")).toBeTruthy();
		expect(screen.queryByText("Someone")).toBeNull();
		expect(screen.getByRole("link").getAttribute("aria-label")).toBeNull();
	});

	it("shows unread messages for a profile without a display name", () => {
		render(ProfileMiniCard, { displayName: null, unread: 3, href: HREF });

		expect(screen.getByText("3")).toBeTruthy();
	});

	it("keeps an anonymous card unlabeled", () => {
		render(ProfileMiniCard, { anonymous: true, href: HREF });

		expect(screen.queryByText("Someone")).toBeNull();
		expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
	});

	it("announces a favorite and a recent chat", () => {
		render(ProfileMiniCard, {
			isFavorite: true,
			hadRecentChat: true,
			href: HREF,
		});

		expect(screen.getByText("Favorite")).toBeTruthy();
		expect(screen.getByText("Chatted recently")).toBeTruthy();
	});

	it.each([
		{ unread: 1, announced: "1 unread messages" },
		{ unread: 3, announced: "3 unread messages" },
		{ unread: 99, announced: "99 unread messages" },
		{ unread: 100, announced: "99+ unread messages" },
	])("announces $unread unread as $announced", ({ unread, announced }) => {
		render(ProfileMiniCard, { unread, href: HREF });

		expect(unreadBadge().textContent).toBe(announced);
	});

	it("shows no unread badge without unread messages", () => {
		render(ProfileMiniCard, { unread: 0, href: HREF });

		expect(screen.queryByText("unread messages")).toBeNull();
	});

	it("words its labels in the active locale but keeps the name", async () => {
		const { container } = render(ProfileMiniCard, {
			displayName: "Simon",
			unread: 100,
			isFavorite: true,
			hadRecentChat: true,
			href: HREF,
		});
		const labels = [
			screen.getByText("Favorite"),
			screen.getByText("Chatted recently"),
			unreadBadge(),
		];

		await setLocale({ locale: "en-XA" });

		for (const label of labels) {
			expect(label.textContent).toMatch(PSEUDO_MESSAGE);
		}
		expect(screen.getByText("99+")).toBeTruthy();
		expect(untranslatableTexts(container)).toEqual(["Simon"]);
	});

	it("labels an anonymous card in the active locale", async () => {
		render(ProfileMiniCard, { anonymous: true, href: HREF });

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("link").getAttribute("aria-label")).toMatch(
			PSEUDO_MESSAGE,
		);
	});
});
