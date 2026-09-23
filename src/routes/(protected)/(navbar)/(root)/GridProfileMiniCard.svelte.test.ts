// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

const goto = vi.hoisted(() => vi.fn());

vi.mock("$app/navigation", () => ({ goto }));

const PROFILE_ID = 100200;

function renderTile(): HTMLElement {
	render(GridProfileMiniCard, {
		props: { id: PROFILE_ID, displayName: "Peer" },
	});
	return screen.getByRole("link");
}

function click(
	link: HTMLElement,
	modifiers: MouseEventInit = {},
): { prevented: boolean } {
	const seen = { prevented: false };
	document.addEventListener(
		"click",
		(event) => {
			seen.prevented = event.defaultPrevented;
			event.preventDefault();
		},
		{ once: true },
	);
	link.dispatchEvent(
		new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			...modifiers,
		}),
	);
	return seen;
}

describe("a browse grid tile", () => {
	beforeEach(() => goto.mockClear());
	afterEach(cleanup);

	it("opens the profile as a Browse entry instead of following its href", () => {
		const link = renderTile();

		expect(link.getAttribute("href")).toBe(`/profile/${PROFILE_ID}`);
		expect(click(link).prevented).toBe(true);
		expect(goto).toHaveBeenCalledExactlyOnceWith(`/profile/${PROFILE_ID}`, {
			state: { profileOrigin: "browse" },
		});
	});

	it("leaves a click that asks for a new tab to the browser", () => {
		const link = renderTile();

		expect(click(link, { metaKey: true }).prevented).toBe(false);
		expect(goto).not.toHaveBeenCalled();
	});
});
