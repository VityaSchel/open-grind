// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { SexualPosition } from "#lib/model/users/profiles.ts";
import type { DiscreetPostData } from "#lib/model/right-now/feed.ts";
import DiscreetPostCard from "./DiscreetPostCard.svelte";
import { discreetPostData, photo } from "./feed-post-test-helpers";

function renderCard(overrides: Partial<DiscreetPostData> = {}) {
	return render(DiscreetPostCard, {
		props: { post: discreetPostData(overrides) },
	});
}

afterEach(cleanup);

describe("a discreet Right Now post card", () => {
	it("offers no link or button to reach the anonymous author", () => {
		renderCard({
			text: "Hosting tonight",
			hosting: true,
			distance: 300,
			onlineUntil: Date.now() + 60_000,
			media: [photo(1)],
		});

		const card = screen.getByRole("article", { name: "Hosting tonight" });
		expect(
			within(card).getByRole("img", { name: "Post photo" }),
		).toBeTruthy();
		expect(within(card).queryAllByRole("link")).toHaveLength(0);
		expect(within(card).queryAllByRole("button")).toHaveLength(0);
	});

	it("heads the post with its text", () => {
		renderCard({ text: "Anyone up?" });

		expect(
			screen.getByRole("heading", { name: "Anyone up?" }),
		).toBeTruthy();
		expect(screen.queryByText("Discreet post")).toBeNull();
	});

	it("lists the profile fields the author shared", () => {
		renderCard({
			profileFields: {
				age: 27,
				height: 180,
				weight: 70_000,
				position: SexualPosition.VersTop,
			},
		});

		expect(screen.getByText("27 · 180 cm · 70 kg · Vers Top")).toBeTruthy();
	});

	it("leaves out the profile fields the author kept private", () => {
		renderCard({
			profileFields: {
				age: 31,
				height: null,
				weight: null,
				position: null,
			},
		});

		expect(screen.getByText("31")).toBeTruthy();
		expect(screen.queryByText(/·/)).toBeNull();
	});

	it("shows no profile fields line when the author shared none", () => {
		const { container } = renderCard();

		expect(
			container.querySelector(
				'[data-slot="right-now-discreet-post-fields"]',
			),
		).toBeNull();
	});

	it("falls back to a generic headline when the post has no text", () => {
		renderCard();

		expect(
			screen.getByRole("heading", { name: "Discreet post" }),
		).toBeTruthy();
	});
});
