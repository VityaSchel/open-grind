import { describe, expect, it } from "vitest";

import type { ScannedKey, ViewScan } from "../../src/lib/demo/screenshot-scan";
import { highlightPath, imagePath, viewKeys } from "./manifest";

const BOX = { x: 4, y: 4, width: 20, height: 10 };
const TITLE = "auth.signIn.title";

function scanned(key: string): ScannedKey {
	return { key, box: BOX, via: "text", top: false, boxes: [BOX, BOX] };
}

function scanOf(titleKeys: string[]): ViewScan {
	return {
		keys: [scanned("auth.signIn.submit"), scanned("common.cancel")],
		titleKeys,
		unmarked: [],
		emoji: [],
		measured: true,
		compositeButtons: [],
	};
}

describe("highlightPath", () => {
	it("puts a key's copy in a folder named like its view's image", () => {
		expect(
			highlightPath({ viewId: "settings/app", key: "settings.title" }),
		).toBe("images/settings/app/settings.title.webp");
		expect(imagePath("settings/app")).toBe("images/settings/app.webp");
	});

	it("names numbered screens like their images", () => {
		expect(
			highlightPath({ viewId: "settings/app#2", key: "common.save" }),
		).toBe("images/settings/app.2/common.save.webp");
		expect(imagePath("settings/app#2")).toBe("images/settings/app.2.webp");
	});

	it.each(["../escape.key", "common/save", "plain", "common..save"])(
		"refuses the key %s",
		(key) => {
			expect(() =>
				highlightPath({ viewId: "settings/app", key }),
			).toThrow(`Invalid message key ${key}`);
		},
	);
});

describe("viewKeys", () => {
	it("adds a boxless entry for each key only the document title holds", () => {
		expect(
			viewKeys({
				scan: scanOf([TITLE, "common.cancel"]),
				viewId: "auth/sign-in",
				screen: undefined,
			}),
		).toEqual([
			{ key: "auth.signIn.submit", box: BOX, via: "text", top: false },
			{ key: TITLE, via: "document-title", top: false },
			{ key: "common.cancel", box: BOX, via: "text", top: false },
		]);
	});

	it.each([
		{ viewId: "auth/sign-in#2", screen: undefined },
		{ viewId: "auth/sign-in/refused", screen: "auth/sign-in" },
	])("leaves the document title out of $viewId", ({ viewId, screen }) => {
		expect(
			viewKeys({ scan: scanOf([TITLE]), viewId, screen }).map(
				({ key }) => key,
			),
		).toEqual(["auth.signIn.submit", "common.cancel"]);
	});
});
