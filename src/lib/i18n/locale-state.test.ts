import { afterEach, describe, expect, it, vi } from "vitest";

import {
	getCatalogLocale,
	getFormatLocales,
	getLocale,
	setLocale,
	SOURCE_LOCALE,
	t,
} from "./index";

vi.mock("./catalog-files", () => import("./fixtures/mock-catalog-files"));

type FixtureTranslate = (
	key: string,
	params?: Readonly<Record<string, string | number>>,
) => string;

const translateFixture = t as unknown as FixtureTranslate;

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("matching in setLocale", () => {
	it("starts in American English with the English catalog", async () => {
		vi.resetModules();
		const fresh = await import("./locale-state.svelte");
		expect(fresh.getLocale()).toBe("en-US");
		expect(fresh.getCatalogLocale()).toBe(SOURCE_LOCALE);
	});

	it("reports the requested tag and loads the closest catalogs", async () => {
		await setLocale({ locale: "es-MX" });
		expect(getLocale()).toBe("es-MX");
		expect(getCatalogLocale()).toBe("es-419");
		expect(document.documentElement.lang).toBe("es-MX");
		expect(document.documentElement.dir).toBe("ltr");
		expect(getFormatLocales().text).toMatch(/^es-MX-/);
		expect(
			[
				"sample.inbox.empty",
				"sample.settings.theme.light",
				"sample.app.tagline",
			].map((key) => translateFixture(key)),
		).toEqual([
			"Todavía no hay mensajes",
			"Claro",
			"A free client — no ads, no tracking",
		]);
	});

	it("reports a bare language as given and loads its default variant", async () => {
		await setLocale({ locale: "pt" });
		expect(getLocale()).toBe("pt");
		expect(getCatalogLocale()).toBe("pt-BR");
		expect(document.documentElement.lang).toBe("pt");
	});

	it("normalizes a POSIX tag before reporting it", async () => {
		await setLocale({ locale: "de_AT.UTF-8" });
		expect(getLocale()).toBe("de-AT");
		expect(document.documentElement.lang).toBe("de-AT");
		expect(t("common.actions.close")).toBe("Schließen");
	});

	it("picks plural forms by each catalog's own language", async () => {
		await setLocale({ locale: "pt-AO" });
		expect(getCatalogLocale()).toBe("pt-PT");
		expect(new Intl.PluralRules("pt-AO").select(0)).toBe("one");
		expect(
			[0, 1, 1_000_000].map((count) =>
				translateFixture("sample.photos", { count }),
			),
		).toEqual(["PT:other 0", "PT:one 1", "PT:many 1000000"]);
		expect(translateFixture("sample.chat.unread", { count: 2 })).toBe(
			"F2:other 2",
		);
	});

	it("keeps a matched pseudo-locale exact", async () => {
		await setLocale({ locale: "en-XA" });
		expect(getLocale()).toBe("en-XA");
		expect(getCatalogLocale()).toBe("en-XA");
	});

	it.each(["sw-KE", "zh-TW", "hi-Latn", "C", "und", "xx-YY"])(
		"rejects %s, which no catalog matches",
		async (locale) => {
			await setLocale({ locale: "de" });
			await expect(setLocale({ locale })).rejects.toThrow(RangeError);
			expect(getLocale()).toBe("de");
		},
	);
});
