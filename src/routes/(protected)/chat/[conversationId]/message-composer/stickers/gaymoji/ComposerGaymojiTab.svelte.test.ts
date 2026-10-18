// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getGaymoji: vi.fn() }));

vi.mock("$lib/api/messaging/gaymoji", () => api);

import type { GaymojiCategory, GaymojiItem } from "$lib/api/messaging/gaymoji";
import type { StickerPick } from "../sticker-pick";
import ComposerGaymojiTab from "./ComposerGaymojiTab.svelte";

const MANIFEST_SIZE = 579;
const SKELETON = '[data-slot="sticker-grid-skeleton"]';
const TILE_IMAGE = '[data-slot="sticker-tile"] img';

function gaymojiItem(index: number): GaymojiItem {
	const name = `${index}_Sticker_${index}`;
	return {
		id: `${name}.png`,
		label: `Sticker ${index}`,
		imageUrl: `data:image/png;base64,${index}`,
		imageHash: `gaymoji/${name}.png`,
	};
}

const fullItems = Array.from({ length: MANIFEST_SIZE }, (_, index) =>
	gaymojiItem(index),
);
const fullManifest: GaymojiCategory[] = [
	{ name: "body", items: fullItems.slice(0, 300) },
	{ name: "mood", items: fullItems.slice(300) },
];
const shortItems = fullItems.slice(0, 12);
const shortManifest: GaymojiCategory[] = [
	{ name: "body", items: shortItems.slice(0, 6) },
	{ name: "mood", items: shortItems.slice(6) },
];

const onPick = vi.fn<(pick: StickerPick) => void>();

function mount({
	active,
	pickedId = null,
}: {
	active: boolean;
	pickedId?: string | null;
}) {
	return render(ComposerGaymojiTab, {
		props: { active, pickedId, onPick, holdSheetSize: () => () => {} },
	});
}

async function settle() {
	await tick();
	await tick();
}

function tiles(): HTMLButtonElement[] {
	return screen.queryAllByRole("button", { name: /^Sticker \d+$/ });
}

function tileLabels(): (string | null)[] {
	return tiles().map((button) => button.getAttribute("aria-label"));
}

function tile(label: string): HTMLButtonElement {
	return screen.getByRole("button", { name: label });
}

function pressed(label: string): string | null {
	return tile(label).getAttribute("aria-pressed");
}

beforeEach(() => {
	onPick.mockReset();
	api.getGaymoji.mockReset();
	api.getGaymoji.mockResolvedValue(shortManifest);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("composer Gaymoji tab", () => {
	it("loads the manifest only once the tab first becomes active", async () => {
		const { container, rerender } = mount({ active: false });
		await settle();
		expect(api.getGaymoji).not.toHaveBeenCalled();
		expect(container.querySelector(SKELETON)).toBeNull();
		expect(tiles()).toHaveLength(0);

		let answer!: (categories: GaymojiCategory[]) => void;
		api.getGaymoji.mockReturnValue(
			new Promise<GaymojiCategory[]>((resolve) => (answer = resolve)),
		);
		await rerender({ active: true });
		expect(api.getGaymoji).toHaveBeenCalledOnce();
		expect(container.querySelector(SKELETON)).not.toBeNull();

		answer(shortManifest);
		await settle();
		expect(container.querySelector(SKELETON)).toBeNull();
		expect(tiles()).toHaveLength(shortItems.length);

		await rerender({ active: false });
		await rerender({ active: true });
		expect(api.getGaymoji).toHaveBeenCalledOnce();
	});

	it("drops its tile images while hidden and restores them without refetching", async () => {
		const { container, rerender } = mount({
			active: true,
			pickedId: gaymojiItem(3).id,
		});
		await settle();
		const labels = shortItems.map((gaymoji) => gaymoji.label);
		expect(tileLabels()).toEqual(labels);
		expect(container.querySelectorAll(TILE_IMAGE)).toHaveLength(
			labels.length,
		);

		await rerender({ active: false });
		expect(tiles()).toHaveLength(0);
		expect(container.querySelectorAll("img")).toHaveLength(0);

		await rerender({ active: true });
		expect(tileLabels()).toEqual(labels);
		expect(container.querySelectorAll(TILE_IMAGE)).toHaveLength(
			labels.length,
		);
		expect(pressed("Sticker 3")).toBe("true");
		expect(api.getGaymoji).toHaveBeenCalledOnce();
	});

	it("renders every item in manifest order with its label as the image alt", async () => {
		api.getGaymoji.mockResolvedValue(fullManifest);
		mount({ active: true });
		await settle();

		const rendered = tiles();
		expect(
			rendered.map((button) => button.getAttribute("aria-label")),
		).toEqual(fullItems.map((gaymoji) => gaymoji.label));
		const last = rendered.at(-1)!;
		expect(last.querySelector("img")?.getAttribute("alt")).toBe(
			`Sticker ${MANIFEST_SIZE - 1}`,
		);
	});

	it("titles a section per category and lists them in a category strip", async () => {
		mount({ active: true });
		await settle();

		const strip = screen.getByRole("navigation", {
			name: "Gaymoji categories",
		});
		expect(
			[...strip.querySelectorAll("button")].map((button) =>
				button.getAttribute("aria-label"),
			),
		).toEqual(["Body", "Mood"]);
		expect(
			screen
				.getAllByRole("heading", { level: 3 })
				.map((heading) => heading.textContent?.trim()),
		).toEqual(["Body", "Mood"]);
		expect(
			screen
				.getByRole("region", { name: "Mood" })
				.querySelectorAll('[data-slot="sticker-tile"]'),
		).toHaveLength(6);
	});

	it("presses only the Gaymoji its menu has picked", async () => {
		const { rerender } = mount({
			active: true,
			pickedId: gaymojiItem(3).id,
		});
		await settle();
		expect(pressed("Sticker 3")).toBe("true");
		expect(pressed("Sticker 7")).toBe("false");

		await rerender({ pickedId: gaymojiItem(7).id });
		expect(pressed("Sticker 3")).toBe("false");
		expect(pressed("Sticker 7")).toBe("true");

		await rerender({ pickedId: null });
		expect(pressed("Sticker 7")).toBe("false");
		expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(
			0,
		);
	});

	it("shows a neutral error and loads again on retry", async () => {
		api.getGaymoji.mockRejectedValueOnce(new Error("offline"));
		const { container } = mount({ active: true });
		await settle();

		expect(screen.getByText("Couldn't load Gaymoji")).toBeTruthy();
		expect(container.textContent).not.toContain("Grindr");
		expect(tiles()).toHaveLength(0);

		await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await settle();

		expect(api.getGaymoji).toHaveBeenCalledTimes(2);
		expect(screen.queryByText("Couldn't load Gaymoji")).toBeNull();
		expect(tiles()).toHaveLength(shortItems.length);
	});

	it("hands a tapped Gaymoji to its menu by its image hash", async () => {
		mount({ active: true });
		await settle();

		await fireEvent.click(tile("Sticker 7"));

		expect(onPick).toHaveBeenCalledExactlyOnceWith({
			id: "7_Sticker_7.png",
			message: {
				type: "Gaymoji",
				body: { imageHash: "gaymoji/7_Sticker_7.png" },
			},
		});
		expect(pressed("Sticker 7")).toBe("false");
	});
});
