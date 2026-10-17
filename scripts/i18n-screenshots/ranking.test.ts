import { describe, expect, it } from "vitest";

import type { KeySource, ShownKey } from "../../src/lib/demo/screenshot-scan";
import type { TitleKey } from "./manifest";
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

function titled(key = KEY): TitleKey {
	return { key, via: "document-title", top: false };
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

function toasts(count: number): ShownKey[] {
	return Array.from({ length: count }, (_, index) =>
		shown({ key: `toast.message${index}`, top: true }),
	);
}

function highlightedIn({
	views,
	key,
}: {
	views: RankedViews;
	key: string;
}): string[] {
	return [...chooseHighlights(views)]
		.filter(([, keys]) => keys.has(key))
		.map(([viewId]) => viewId)
		.sort();
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

describe("rankViews on screens", () => {
	it("keeps one view per screen for a key outside the top layer", () => {
		expect(
			rankOf({
				base: {
					keys: [
						shown({}),
						...others({ namespace: "settings", count: 4 }),
					],
				},
				"base/toast": {
					screen: "base",
					keys: [shown({}), ...toasts(1)],
				},
				"base/dialog": {
					screen: "base",
					keys: [shown({}), ...toasts(2)],
				},
			}),
		).toEqual(["base"]);
	});

	it("keeps the view with the fewest top-layer keys on a screen", () => {
		expect(
			rankOf({
				"base/one": {
					screen: "base",
					keys: [
						shown({ via: "attribute" }),
						...others({ namespace: "settings", count: 4 }),
						...toasts(1),
					],
				},
				"base/three": {
					screen: "base",
					keys: [shown({}), ...toasts(3)],
				},
			}),
		).toEqual(["base/one"]);
	});

	it("counts each top-layer key once", () => {
		expect(
			rankOf({
				"base/a": {
					screen: "base",
					keys: [
						shown({ via: "attribute" }),
						...toasts(1),
						...toasts(1),
					],
				},
				"base/b": { screen: "base", keys: [shown({}), ...toasts(2)] },
			}),
		).toEqual(["base/a"]);
	});

	it("breaks a tie on top-layer keys in the usual order", () => {
		expect(
			rankOf({
				"base/a": {
					screen: "base",
					keys: [shown({ via: "attribute" }), ...toasts(1)],
				},
				"base/b": { screen: "base", keys: [shown({}), ...toasts(1)] },
			}),
		).toEqual(["base/b"]);
		expect(
			rankOf({
				"base/a": {
					screen: "base",
					keys: [
						shown({}),
						...others({ namespace: "settings", count: 2 }),
						...toasts(1),
					],
				},
				"base/b": {
					screen: "base",
					keys: [
						shown({}),
						...others({ namespace: "settings", count: 1 }),
						...toasts(1),
					],
				},
			}),
		).toEqual(["base/b"]);
		expect(
			rankOf({
				"base/b": { screen: "base", keys: [shown({}), ...toasts(1)] },
				"base/a": { screen: "base", keys: [shown({}), ...toasts(1)] },
			}),
		).toEqual(["base/a"]);
	});

	it("lets a view where the key is top stand beside its screen", () => {
		expect(
			rankOf({
				base: { keys: [shown({})] },
				"base/menu": {
					screen: "base",
					keys: [
						shown({ via: "attribute", top: true }),
						...toasts(4),
					],
				},
				"base/toast": {
					screen: "base",
					keys: [shown({}), ...toasts(1)],
				},
			}),
		).toEqual(["base/menu", "base"]);
	});

	it("keeps every view where the key is top on one screen", () => {
		expect(
			rankOf({
				"base/first": {
					screen: "base",
					keys: [shown({ top: true }), ...toasts(2)],
				},
				"base/second": { screen: "base", keys: [shown({ top: true })] },
			}),
		).toEqual(["base/first", "base/second"]);
	});

	it("groups a variant with the numbered screen it names", () => {
		expect(
			rankOf({
				page: { keys: [shown({})] },
				"page#2": {
					keys: [
						shown({}),
						...others({ namespace: "settings", count: 3 }),
					],
				},
				"page/toast": {
					screen: "page#2",
					keys: [shown({}), ...toasts(1)],
				},
			}),
		).toEqual(["page", "page#2"]);
	});

	it("keeps a variant when the screen it names failed", () => {
		expect(
			rankOf({
				"failed/one": {
					screen: "failed",
					keys: [shown({}), ...toasts(2)],
				},
				"failed/two": {
					screen: "failed",
					keys: [shown({}), ...toasts(1)],
				},
				other: { keys: [shown({ via: "attribute" })] },
			}),
		).toEqual(["failed/two", "other"]);
	});
});

describe("chooseHighlights on screens", () => {
	it("highlights a sign-in button shown under toasts only on the sign-in screen", () => {
		const signIn = "auth/sign-in";
		const withGoogle = "auth.signIn.withGoogle";
		const views: RankedViews = {
			[signIn]: {
				keys: [
					shown({ key: withGoogle }),
					...others({ namespace: "auth", count: 8 }),
				],
			},
		};
		for (const variant of ["refused", "server-errors", "captcha-checks"]) {
			views[`${signIn}/${variant}`] = {
				screen: signIn,
				keys: [
					shown({ key: withGoogle }),
					...others({ namespace: "auth", count: 2 }),
					...toasts(3),
				],
			};
		}
		expect(highlightedIn({ views, key: withGoogle })).toEqual([signIn]);
		expect(chooseHighlights(views).get(`${signIn}/refused`)).toEqual(
			new Set(["toast.message0", "toast.message1", "toast.message2"]),
		);
	});

	it(`highlights a key on at most ${HIGHLIGHTS_PER_KEY} distinct screens`, () => {
		const views: RankedViews = {};
		for (const base of ["a", "b", "c", "d"]) {
			views[base] = { keys: [shown({})] };
			views[`${base}/toast`] = {
				screen: base,
				keys: [shown({ key: "other.key" }), shown({}), ...toasts(1)],
			};
		}
		expect(highlightedIn({ views, key: KEY })).toEqual(["a", "b", "c"]);
	});
});

describe("document title entries", () => {
	it("ranks no view where the key is only the document title", () => {
		expect(
			rankOf({ a: { keys: [titled()] }, b: { keys: [shown({})] } }),
		).toEqual(["b"]);
		expect(rankOf({ a: { keys: [titled()] } })).toBeUndefined();
		expect(chooseHighlights({ a: { keys: [titled()] } }).size).toBe(0);
	});

	it("leaves a document title out of the namespace count", () => {
		expect(
			rankOf({
				a: {
					keys: [
						shown({}),
						titled("settings.pageTitle"),
						titled("settings.otherTitle"),
					],
				},
				z: { keys: [shown({}), shown({ key: "settings.other0" })] },
			}),
		).toEqual(["a", "z"]);
	});

	it("keeps a document title out of the same-screen collapse", () => {
		expect(
			rankOf({
				base: { keys: [titled()] },
				"base/toast": {
					screen: "base",
					keys: [shown({}), ...toasts(1)],
				},
			}),
		).toEqual(["base/toast"]);
	});
});
