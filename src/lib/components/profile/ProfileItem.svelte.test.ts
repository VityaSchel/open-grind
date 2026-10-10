// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { createRawSnippet, mount, type Snippet, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { untranslatableTexts } from "$lib/test/untranslatable";
import FavoriteStar from "./FavoriteStar.svelte";
import ProfileItem from "./ProfileItem.svelte";

const favoriteBadge = createRawSnippet(() => ({
	render: () => "<span></span>",
	setup: (target) => {
		const star = mount(FavoriteStar, { target });
		return () => void unmount(star);
	},
}));

function renderItem(title: {
	value: string | null;
	fallback?: string;
	badge?: Snippet;
}) {
	return render(ProfileItem, {
		props: {
			avatar: { mediaHash: null, link: "/profile/7/photos" },
			title,
			link: "/profile/7",
		},
	});
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ProfileItem", () => {
	it.each([
		{ title: { value: "Sam" }, label: "Sam’s profile" },
		{ title: { value: null }, label: "Someone’s profile" },
		{
			title: { value: null, fallback: "Unnamed" },
			label: "Unnamed’s profile",
		},
	])("labels the avatar link $label", ({ title, label }) => {
		renderItem(title);

		expect(screen.getByRole("link", { name: label })).toBeTruthy();
	});

	it("announces a favorite badge", () => {
		renderItem({ value: "Sam", badge: favoriteBadge });

		expect(screen.getByText("Favorite")).toBeTruthy();
	});

	it("words its labels in the active locale but keeps the name", async () => {
		const { container } = renderItem({
			value: "Sam",
			badge: favoriteBadge,
		});
		const avatarLink = screen.getByRole("link", { name: "Sam’s profile" });
		const favorite = screen.getByText("Favorite");

		await setLocale({ locale: "en-XA" });

		const label = avatarLink.getAttribute("aria-label");
		expect(label).toMatch(PSEUDO_MESSAGE);
		expect(label).toContain("Sam");
		expect(favorite.textContent).toMatch(PSEUDO_MESSAGE);
		expect(untranslatableTexts(container)).toEqual(["Sam"]);
	});
});
