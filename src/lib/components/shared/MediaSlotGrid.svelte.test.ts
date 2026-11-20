// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import MediaSlotGrid from "./MediaSlotGrid.svelte";

type GridProps = {
	disabled?: boolean;
	add?: { label: string; disabled: boolean; onclick: () => void };
};

const onDelete = vi.fn();

const photos = ["a", "b", "c"].map((key, index) => ({
	key,
	src: `https://example.invalid/${key}.jpg`,
	alt: `Photo in slot ${index + 1}`,
	deleteLabel: `Remove photo in slot ${index + 1}`,
	undoLabel: `Keep photo in slot ${index + 1}`,
	onDelete,
}));

function addTile(disabled: boolean): GridProps["add"] {
	return { label: "Add photos", disabled, onclick: () => {} };
}

function renderGrid({
	slots = photos,
	...props
}: GridProps & { slots?: typeof photos }) {
	const rendered = render(MediaSlotGrid, {
		props: { slots, onReorder: () => {}, ...props },
	});
	const grid = rendered.container.querySelector<HTMLElement>(
		'[data-slot="media-slot-grid"]',
	)!;
	const cells = () => [
		...grid.querySelectorAll<HTMLElement>('[data-slot="media-slot-cell"]'),
	];
	return { ...rendered, grid, cells };
}

function tabStops(grid: HTMLElement): Element[] {
	return [...grid.querySelectorAll('[tabindex="0"]')];
}

beforeEach(() => {
	runningOn("linux");
});

afterEach(() => {
	cleanup();
	onDelete.mockReset();
	resetPlatform();
});

describe("media slot grid tab stop", () => {
	it("keeps an add tile that mounts disabled beside a focused photo out of the Tab order", async () => {
		const { grid, cells, rerender } = renderGrid({});
		cells()[1]!.focus();
		await tick();

		await rerender({ slots: photos, add: addTile(true) });
		const add = grid.querySelector('[data-slot="add-tile"]')!;
		expect(add.getAttribute("tabindex")).toBe("-1");
		expect(tabStops(grid)).toEqual([cells()[1]]);

		await rerender({ slots: photos, add: addTile(false) });
		expect(add.getAttribute("tabindex")).toBe("-1");
		expect(tabStops(grid)).toEqual([cells()[1]]);
	});
});

describe("media slot grid keys", () => {
	it("ignores Space and Delete while saving or uploading, and Space never scrolls the page", async () => {
		const { cells } = renderGrid({ disabled: true });
		const cell = cells()[0]!;
		cell.focus();

		expect(await fireEvent.keyDown(cell, { key: " " })).toBe(false);
		expect(await fireEvent.keyDown(cell, { key: "Delete" })).toBe(true);

		expect(cell.hasAttribute("data-dragging")).toBe(false);
		expect(onDelete).not.toHaveBeenCalled();
	});

	it("keeps Space from scrolling the page when a lone photo has nowhere to move", async () => {
		const { cells } = renderGrid({ slots: photos.slice(0, 1) });
		const cell = cells()[0]!;
		cell.focus();

		expect(await fireEvent.keyDown(cell, { key: " " })).toBe(false);
		expect(cell.hasAttribute("data-dragging")).toBe(false);
	});

	it("lifts the focused photo with Space once there is somewhere to move it", async () => {
		const { cells } = renderGrid({});
		const cell = cells()[0]!;
		cell.focus();

		expect(await fireEvent.keyDown(cell, { key: " " })).toBe(false);
		expect(cell.hasAttribute("data-dragging")).toBe(true);
		expect(
			document
				.querySelector('[data-slot="media-slot-grid-status"]')
				?.textContent?.trim(),
		).toBe("Picked up at 1 of 3");
	});
});
