import { describe, expect, it } from "vitest";

import type { KeySource, ShownKey } from "../../src/lib/demo/screenshot-scan";
import {
	chooseHighlights,
	HIGHLIGHTS_PER_KEY,
	type RankedViews,
	rankViews,
} from "./ranking";

const KEY = "settings.title";

function shown({
	key = KEY,
	via = "text",
	top = false,
}: {
	key?: string;
	via?: KeySource;
	top?: boolean;
}): ShownKey {
	return { key, box: { x: 0, y: 0, width: 10, height: 10 }, via, top };
}

function others({
	namespace,
	count,
}: {
	namespace: string;
	count: number;
}): ShownKey[] {
	return Array.from({ length: count }, (_, index) =>
		shown({ key: `${namespace}.other${index}` }),
	);
}

function rankOf(views: RankedViews): string[] | undefined {
	return rankViews(views).get(KEY);
}

describe("rankViews", () => {
	it("puts a view where the key sits on the top layer first", () => {
		expect(
			rankOf({
				a: { keys: [shown({ via: "text" })] },
				z: {
					keys: [
						shown({ via: "attribute", top: true }),
						...others({ namespace: "settings", count: 5 }),
					],
				},
			}),
		).toEqual(["z", "a"]);
	});

	it("puts visible text before an attribute on the same layer", () => {
		expect(
			rankOf({
				a: { keys: [shown({ via: "attribute", top: true })] },
				z: {
					keys: [
						shown({ via: "text", top: true }),
						...others({ namespace: "settings", count: 5 }),
					],
				},
			}),
		).toEqual(["z", "a"]);
	});

	it("puts the view with fewer keys of the key's namespace first", () => {
		expect(
			rankOf({
				a: {
					keys: [
						shown({ via: "attribute" }),
						...others({ namespace: "settings", count: 2 }),
					],
				},
				z: {
					keys: [
						shown({ via: "attribute" }),
						shown({ key: "settings.other0" }),
						...others({ namespace: "common", count: 8 }),
					],
				},
			}),
		).toEqual(["z", "a"]);
	});

	it("breaks a full tie by view id in code unit order", () => {
		const tied = {
			keys: [shown({}), ...others({ namespace: "settings", count: 1 })],
		};
		expect(rankOf({ b: tied, "a/c": tied, "a#2": tied, a: tied })).toEqual([
			"a",
			"a#2",
			"a/c",
			"b",
		]);
	});

	it("ranks a key only among the views that show it", () => {
		expect(
			rankOf({
				a: { keys: others({ namespace: "settings", count: 1 }) },
				b: { keys: [shown({})] },
			}),
		).toEqual(["b"]);
		expect(rankOf({ a: { keys: [] } })).toBeUndefined();
	});
});

describe("chooseHighlights", () => {
	const views: RankedViews = {
		v1: { keys: [shown({}), shown({ key: "common.save" })] },
		v2: { keys: [shown({ top: true })] },
		v3: {
			keys: [
				shown({ via: "attribute" }),
				shown({ key: "common.cancel", via: "attribute" }),
			],
		},
		v4: { keys: [shown({ via: "attribute", top: true })] },
		v5: {
			keys: [
				shown({}),
				...others({ namespace: "settings", count: 3 }),
				shown({ key: "common.cancel" }),
			],
		},
	};

	it(`highlights the key in its top ${HIGHLIGHTS_PER_KEY} views only`, () => {
		expect(rankOf(views)).toEqual(["v2", "v4", "v1", "v5", "v3"]);
		const chosen = chooseHighlights(views);
		const withKey = [...chosen]
			.filter(([, keys]) => keys.has(KEY))
			.map(([viewId]) => viewId)
			.sort();
		expect(withKey).toEqual(["v1", "v2", "v4"]);
	});

	it(`highlights every view of a key shown in fewer than ${HIGHLIGHTS_PER_KEY} views`, () => {
		const chosen = chooseHighlights(views);
		expect(chosen.get("v1")).toEqual(new Set([KEY, "common.save"]));
		expect(chosen.get("v3")).toEqual(new Set(["common.cancel"]));
		expect(chosen.get("v5")).toEqual(
			new Set([
				"settings.other0",
				"settings.other1",
				"settings.other2",
				"common.cancel",
			]),
		);
	});

	it("chooses nothing when no view shows a key", () => {
		expect(chooseHighlights({ empty: { keys: [] } }).size).toBe(0);
	});
});
