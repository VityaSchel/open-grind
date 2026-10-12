import { describe, expect, it } from "vitest";

import { highlightPath, imagePath } from "./manifest";

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
