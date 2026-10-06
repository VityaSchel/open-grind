import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "./index";
import { translatedLabels } from "./labels";

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

const labels = translatedLabels({
	1: "common.actions.close",
	3: "common.actions.retry",
});
const unlisted: Readonly<Record<number, string>> = labels;

describe("translatedLabels", () => {
	it("names each id with its message", () => {
		expect(Object.entries(labels)).toEqual([
			["1", "Close"],
			["3", "Retry"],
		]);
	});

	it("reads the active locale each time a label is read", async () => {
		await setLocale({ locale: "en-XA" });
		expect(labels[1]).toBe("⟦Çļöšé ö⟧");
		await setLocale({ locale: SOURCE_LOCALE });
		expect(labels[1]).toBe("Close");
	});

	it("has no label for an id outside the table", () => {
		expect(unlisted[2]).toBeUndefined();
	});
});
