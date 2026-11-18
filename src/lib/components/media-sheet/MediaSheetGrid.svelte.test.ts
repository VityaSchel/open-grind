// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { SelectionSet } from "#lib/util/selection.svelte.ts";
import MediaSheetGrid from "./MediaSheetGrid.svelte";

vi.mock("$app/navigation", () => ({ afterNavigate: () => {} }));

type Photo = { id: number };

const ADD_LABEL = "Upload photos or videos";
const COLUMNS = 3;

function renderGrid({ pending }: { pending: number }) {
	const items: Photo[] = Array.from({ length: 6 }, (_, index) => ({
		id: 900_001 + index,
	}));
	const { container } = render(MediaSheetGrid<Photo, number>, {
		props: {
			items,
			error: null,
			onRetry: () => {},
			describe: ({ id }: Photo) => ({
				key: id,
				src: `https://cdns.grindr.com/images/chat/${id}`,
				video: false,
			}),
			selected: new SelectionSet<number>(),
			onToggle: () => {},
			emptyTitle: "No photos",
			addLabel: ADD_LABEL,
			onAdd: () => {},
			pending,
			remove: () => Promise.resolve(),
			onRemoved: () => {},
		},
	});
	const grid = container.querySelector<HTMLElement>(
		'[data-slot="media-grid"]',
	)!;
	grid.style.gridTemplateColumns = Array(COLUMNS).fill("100px").join(" ");
}

function photoTile(position: number): HTMLElement {
	return screen.getByRole("button", { name: `Photo ${position}` });
}

function addTile(): HTMLElement {
	return screen.getByRole("button", { name: ADD_LABEL });
}

async function pressOn({ target, key }: { target: HTMLElement; key: string }) {
	target.focus();
	target.dispatchEvent(
		new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
	);
	await tick();
	await tick();
}

beforeEach(() => {
	runningOn("linux");
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
	resetPlatform();
});

describe("media sheet grid arrows with uploads in flight", () => {
	it("ArrowRight from the add tile skips the upload placeholders and lands on the first photo", async () => {
		renderGrid({ pending: 2 });

		await pressOn({ target: addTile(), key: "ArrowRight" });

		expect(document.activeElement).toBe(photoTile(1));
	});

	it("ArrowDown from the add tile keeps its column past the placeholders on the first row", async () => {
		renderGrid({ pending: 1 });

		await pressOn({ target: addTile(), key: "ArrowDown" });

		expect(document.activeElement).toBe(photoTile(2));
	});

	it("ArrowUp from the second row returns to the add tile above it", async () => {
		renderGrid({ pending: 1 });

		await pressOn({ target: photoTile(2), key: "ArrowUp" });

		expect(document.activeElement).toBe(addTile());
	});
});
