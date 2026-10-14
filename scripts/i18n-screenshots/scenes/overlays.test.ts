import { describe, expect, it } from "vitest";

import type { ShownKey } from "../../../src/lib/demo/screenshot-scan";
import type { Captured, Platform, View } from "../manifest";
import { type Scene, type SceneView, scenes } from ".";
import {
	requireScreen,
	screenProblems,
	STANDALONE,
	type Standalone,
	unkeptScreens,
} from "./overlays";

const BOX = { x: 0, y: 0, width: 10, height: 10 };
const PAGE: ShownKey = { key: "page.title", box: BOX, via: "text", top: false };
const TOAST: ShownKey = {
	key: "toast.message",
	box: BOX,
	via: "text",
	top: true,
};

function view({
	id,
	screen,
	scroller,
}: {
	id: string;
	screen?: string;
	scroller?: string;
}): SceneView {
	return { id, screen, scroller, drive: async () => {} };
}

function scene({
	platform = "phone",
	views,
}: {
	platform?: Platform;
	views: [SceneView, ...SceneView[]];
}): Scene {
	return { platform, views };
}

function problemsOf({
	variant,
	standalone = [],
}: {
	variant: SceneView;
	standalone?: Standalone[];
}): string[] {
	return screenProblems({
		scenes: [
			scene({
				views: [
					view({ id: "page" }),
					view({ id: "list", scroller: ".list" }),
					view({ id: "page/toast", screen: "page" }),
				],
			}),
			scene({ platform: "desktop", views: [view({ id: "wide" })] }),
			scene({ views: [variant] }),
		],
		standalone,
	});
}

describe("screenProblems", () => {
	it("finds none in the scenes", () => {
		expect(screenProblems({ scenes, standalone: STANDALONE })).toEqual([]);
	});

	it.each(["page", "list#2", "list#6"])("accepts %s", (screen) => {
		expect(
			problemsOf({ variant: view({ id: "variant", screen }) }),
		).toEqual([]);
	});

	it.each([
		["missing", "variant: names missing, which no scene defines"],
		["variant", "variant: names itself"],
		["wide", "variant: names wide, which is captured on desktop"],
		[
			"page/toast",
			"variant: names page/toast, which has a screen of its own",
		],
		["page#2", "variant: names page#2, but page has no scroller"],
		["list#1", "variant: names list#1, which no run numbers that way"],
		["list#02", "variant: names list#02, which no run numbers that way"],
		["list#7", "variant: names list#7, which no run numbers that way"],
	])("refuses %s", (screen, problem) => {
		expect(
			problemsOf({ variant: view({ id: "variant", screen }) }),
		).toEqual([problem]);
	});

	it("refuses a standalone view that is undefined or names a screen", () => {
		expect(
			problemsOf({
				variant: view({ id: "variant", screen: "page" }),
				standalone: [{ reason: "Alone", views: ["variant", "gone"] }],
			}),
		).toEqual([
			"variant: standalone, but names page",
			"gone: standalone, but undefined",
		]);
	});
});

describe("requireScreen", () => {
	it("refuses an overlay over no screen", () => {
		expect(() =>
			requireScreen({
				view: view({ id: "variant" }),
				keys: [PAGE, TOAST],
			}),
		).toThrow(
			"Shows toast.message in an overlay but names no screen under it and is not standalone",
		);
	});

	it("accepts an overlay over a screen", () => {
		expect(() =>
			requireScreen({
				view: view({ id: "variant", screen: "page" }),
				keys: [PAGE, TOAST],
			}),
		).not.toThrow();
	});

	it("accepts an overlay on a standalone view", () => {
		const [standalone] = STANDALONE.flatMap(({ views }) => views);
		if (standalone === undefined) throw new Error("No standalone view");
		expect(() =>
			requireScreen({ view: view({ id: standalone }), keys: [TOAST] }),
		).not.toThrow();
	});

	it("accepts a view without an overlay", () => {
		expect(() =>
			requireScreen({ view: view({ id: "page" }), keys: [PAGE] }),
		).not.toThrow();
	});
});

describe("unkeptScreens", () => {
	function captured(
		screens: Record<string, string | undefined>,
	): Captured["views"] {
		return Object.fromEntries(
			Object.entries(screens).map(([id, screen]): [string, View] => [
				id,
				{
					image: `images/${id}.webp`,
					sha256: "",
					pixelHash: "",
					platform: "phone",
					screen,
					keys: [],
					ms: 0,
				},
			]),
		);
	}

	it("finds a view whose numbered screen the run did not keep", () => {
		expect(
			unkeptScreens(
				captured({
					list: undefined,
					"list#2": undefined,
					"list/toast": "list#3",
					"list/toast#2": "list#3",
				}),
			),
		).toEqual([{ id: "list/toast", screen: "list#3" }]);
	});

	it("accepts screens that were kept, failed or left out of the run", () => {
		expect(
			unkeptScreens(
				captured({
					list: undefined,
					"list#2": undefined,
					kept: "list#2",
					failed: "page",
					"left-out": "other#2",
				}),
			),
		).toEqual([]);
	});
});
