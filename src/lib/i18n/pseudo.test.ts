import { afterEach, describe, expect, it, vi } from "vitest";

import { locales, richParts, setLocale, SOURCE_LOCALE, t } from "./index";
import { pseudoDictionary } from "./pseudo";
import { MARKUP } from "./syntax";

const SHARED = "{{name}} shared <b>{{count}} photo</b> in {{album}}";

const source = new Map([
	["sample.close", "Close"],
	["sample.error", "Something went wrong"],
	["sample.shared", SHARED],
	["sample.photos_one", "One photo"],
	["sample.photos_other", "{{count}} photos"],
]);

afterEach(async () => {
	vi.unstubAllEnvs();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("en-XA", () => {
	const dictionary = pseudoDictionary({ locale: "en-XA", source });

	it("accents letters, pads by about 35% and wraps each message", () => {
		expect(dictionary.get("sample.close")).toBe("⟦Çļöšé ö⟧");
		expect(dictionary.get("sample.error")).toBe(
			"⟦Šöɱéţĥîñĝ ŵéñţ ŵŕöñĝ öñé ţŵ⟧",
		);
	});

	it("keeps params and tags intact and unaccented", () => {
		const shared = dictionary.get("sample.shared") ?? "";
		expect(shared.match(MARKUP)).toEqual(SHARED.match(MARKUP));
		expect(shared.replace(MARKUP, "")).not.toMatch(/[A-Za-z]/);
		expect(shared).toMatch(/^⟦\{\{name\}\} šĥáŕéð <b>\{\{count\}\} /);
	});

	it("keeps the English plural forms", () => {
		expect(
			[...dictionary.keys()].filter((key) => key.includes("_")),
		).toEqual(["sample.photos_one", "sample.photos_other"]);
	});
});

describe("ar-XB", () => {
	const dictionary = pseudoDictionary({ locale: "ar-XB", source });

	it("overrides each message right to left and changes nothing else", () => {
		expect(dictionary.get("sample.shared")).toBe(`\u202E${SHARED}\u202C`);
		expect(dictionary.get("sample.close")).toBe("\u202EClose\u202C");
	});

	it("fills every Arabic plural form from one and other", () => {
		expect(
			Object.fromEntries(
				[...dictionary].filter(([key]) =>
					key.startsWith("sample.photos"),
				),
			),
		).toEqual({
			"sample.photos_one": "\u202EOne photo\u202C",
			"sample.photos_zero": "\u202E{{count}} photos\u202C",
			"sample.photos_two": "\u202E{{count}} photos\u202C",
			"sample.photos_few": "\u202E{{count}} photos\u202C",
			"sample.photos_many": "\u202E{{count}} photos\u202C",
			"sample.photos_other": "\u202E{{count}} photos\u202C",
		});
	});
});

describe("pseudo-locales at runtime", () => {
	it("are listed in dev builds only", async () => {
		expect(locales).toEqual(expect.arrayContaining(["en-XA", "ar-XB"]));

		vi.stubEnv("DEV", false);
		vi.resetModules();
		const production = await import("./locale-state.svelte");
		expect(production.locales).not.toContain("en-XA");
		expect(production.locales).not.toContain("ar-XB");
		await expect(production.setLocale({ locale: "en-XA" })).rejects.toThrow(
			RangeError,
		);
	});

	it("renders en-XA left to right with English plural rules", async () => {
		await setLocale({ locale: "en-XA" });
		expect(document.documentElement.lang).toBe("en-XA");
		expect(document.documentElement.dir).toBe("ltr");
		expect(t("common.time.minutes", { count: 1 })).toBe("⟦1 ɱîñ ö⟧");
		expect(t("common.time.minutes", { count: 2 })).toBe("⟦2 ɱîñš ö⟧");
		expect(
			richParts("feedback.requestBlocked.cloudflare.knownIssue"),
		).toEqual([
			{ kind: "text", text: "⟦Ţĥîš îš á " },
			{ kind: "tag", name: "knownIssueLink", text: "ķñöŵñ îššûé" },
			{ kind: "text", text: ". öñé ţŵö⟧" },
		]);
	});

	it("renders ar-XB right to left in every Arabic plural form", async () => {
		await setLocale({ locale: "ar-XB" });
		expect(document.documentElement.lang).toBe("ar-XB");
		expect(document.documentElement.dir).toBe("rtl");
		expect(
			[0, 1, 2, 3, 11, 100].map((count) =>
				t("common.time.minutes", { count }),
			),
		).toEqual(
			["0 mins", "1 min", "2 mins", "3 mins", "11 mins", "100 mins"].map(
				(text) => `\u202E${text}\u202C`,
			),
		);
	});
});
