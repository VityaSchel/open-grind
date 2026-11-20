// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { locatePaneControl, paneFocusTarget } from "./focus-handoff";

function pane(markup: string): HTMLElement {
	const section = document.createElement("section");
	section.dataset.slot = "profile-pane";
	section.innerHTML = markup;
	document.body.append(section);
	return section;
}

function topNav(favoriteLabel: string): string {
	return `
		<nav aria-label="Profile Actions">
			<button data-slot="dropdown-menu-trigger">Profile menu</button>
			<button data-slot="button" role="switch">${favoriteLabel}</button>
		</nav>
	`;
}

const BOTTOM_NAV = `
	<nav aria-label="Profile Bottom Actions">
		<button data-slot="button">Chat</button>
		<button data-slot="button">Tap</button>
	</nav>
`;

const PANE_MARKUP = `
	<main tabindex="-1">
		<a data-slot="image-carousel-item" href="#1" tabindex="0">1</a>
		<a data-slot="image-carousel-item" href="#2" tabindex="-1">2</a>
		${topNav("Add to favorites")}
	</main>
	${BOTTOM_NAV}
`;

const FAVORITE_PANE_MARKUP = `
	<main tabindex="-1">
		<div data-slot="image-carousel-item" role="group" tabindex="0">
			<div data-slot="mature-content-cover">
				<button data-slot="button">Show</button>
			</div>
		</div>
		<button data-slot="button">Add note</button>
		${topNav("Remove from favorites")}
	</main>
	${BOTTOM_NAV}
`;

function namedButton({
	within,
	name,
}: {
	within: HTMLElement;
	name: string;
}): HTMLButtonElement {
	return [...within.querySelectorAll("button")].find(
		(button) => button.textContent === name,
	)!;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("handing keyboard focus to the next profile pane", () => {
	it("lands on the control in the same place within the same nav", () => {
		const left = pane(PANE_MARKUP);
		const next = pane(PANE_MARKUP);

		const target = paneFocusTarget({
			pane: next,
			control: locatePaneControl(
				namedButton({ within: left, name: "Tap" }),
			),
		});

		expect(target).toBe(namedButton({ within: next, name: "Tap" }));
	});

	it("ignores buttons outside the nav when a favorite pages to a non-favorite", () => {
		const favorite = pane(FAVORITE_PANE_MARKUP);
		const next = pane(PANE_MARKUP);

		const target = paneFocusTarget({
			pane: next,
			control: locatePaneControl(
				namedButton({
					within: favorite,
					name: "Remove from favorites",
				}),
			),
		});

		expect(target).toBe(
			namedButton({ within: next, name: "Add to favorites" }),
		);
	});

	it("ignores buttons outside the nav when a non-favorite pages to a favorite", () => {
		const left = pane(PANE_MARKUP);
		const favorite = pane(FAVORITE_PANE_MARKUP);

		const target = paneFocusTarget({
			pane: favorite,
			control: locatePaneControl(
				namedButton({ within: left, name: "Add to favorites" }),
			),
		});

		expect(target).toBe(
			namedButton({ within: favorite, name: "Remove from favorites" }),
		);
	});

	it("falls back to main when the next pane has no button in the same place", () => {
		const favorite = pane(FAVORITE_PANE_MARKUP);
		const next = pane(PANE_MARKUP);

		const target = paneFocusTarget({
			pane: next,
			control: locatePaneControl(
				namedButton({ within: favorite, name: "Add note" }),
			),
		});

		expect(target).toBe(next.querySelector("main"));
	});

	it("lands on the photo that holds the carousel's Tab stop", () => {
		const left = pane(PANE_MARKUP);
		const next = pane(PANE_MARKUP);
		const photo = left.querySelector<HTMLElement>('[href="#1"]')!;

		const target = paneFocusTarget({
			pane: next,
			control: locatePaneControl(photo),
		});

		expect(target).toBe(next.querySelector('[href="#1"]'));
	});

	it("falls back to the pane's main when the next pane has no such control", () => {
		const left = pane(PANE_MARKUP);
		const skeleton = pane(`<main tabindex="-1"></main>`);
		const menu = namedButton({ within: left, name: "Profile menu" });

		const target = paneFocusTarget({
			pane: skeleton,
			control: locatePaneControl(menu),
		});

		expect(target).toBe(skeleton.querySelector("main"));
	});

	it("falls back to main for a control without a slot", () => {
		const left = pane(`<main tabindex="-1"><a href="#tag">Tag</a></main>`);
		const next = pane(PANE_MARKUP);

		const target = paneFocusTarget({
			pane: next,
			control: locatePaneControl(left.querySelector("a")!),
		});

		expect(target).toBe(next.querySelector("main"));
	});
});
