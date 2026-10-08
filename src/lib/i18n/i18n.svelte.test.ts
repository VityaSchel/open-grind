import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { restoreCountFormatter } from "./fixtures/count-formatter";
import { markup, slot } from "./fixtures/dom";
import Probe from "./fixtures/Probe.svelte";
import {
	followLocale,
	getLocale,
	locales,
	setCountFormatter,
	setLocale,
	SOURCE_LOCALE,
	sourceText,
	t,
} from "./index";

vi.mock("./catalog-files", () => import("./fixtures/mock-catalog-files"));

type FixtureTranslate = (
	key: string,
	params?: Readonly<Record<string, string | number>>,
) => string;

const translateFixture = t as unknown as FixtureTranslate;

const text = (name: string) =>
	slot(name).textContent.replace(/\s+/g, " ").trim();
const html = (name: string) => markup(slot(name));

afterEach(async () => {
	restoreCountFormatter();
	await setLocale({ locale: SOURCE_LOCALE });
	document.body.replaceChildren();
});

describe("live locale switching", () => {
	it("re-renders template text, $derived and Rich in the same nodes", async () => {
		const props = $state({ count: 1 });
		const probe = mount(Probe, { target: document.body, props });
		flushSync();
		const close = slot("close");
		const minutes = slot("minutes");
		const anchor = slot("known-issue").querySelector("a");
		expect(text("close")).toBe("Close");
		expect(text("minutes")).toBe("1 min");
		expect(html("known-issue")).toBe(
			'This is a <a href="/issues/81">known issue</a>.',
		);

		await setLocale({ locale: "de" });
		flushSync();
		expect(slot("close")).toBe(close);
		expect(slot("minutes")).toBe(minutes);
		expect(slot("known-issue").querySelector("a")).toBe(anchor);
		expect(text("close")).toBe("Schließen");
		expect(text("minutes")).toBe("1 Min.");
		expect(html("known-issue")).toBe(
			'Das ist ein <a href="/issues/81">bekanntes Problem</a>.',
		);

		props.count = 5;
		flushSync();
		expect(text("minutes")).toBe("5 Min.");
		await unmount(probe);
	});

	it("re-evaluates $derived and $effect outside components", async () => {
		const seen: string[] = [];
		const stop = $effect.root(() => {
			const label = $derived(t("common.time.minutes", { count: 2 }));
			$effect(() => {
				seen.push(label);
			});
		});
		flushSync();
		await setLocale({ locale: "de" });
		flushSync();
		stop();
		expect(seen).toEqual(["2 mins", "2 Min."]);
	});

	it("reapplies imperative text on each switch until stopped", async () => {
		const label = document.createElement("button");
		const stop = followLocale(() => {
			label.title = t("common.actions.close");
		});
		flushSync();
		expect(label.title).toBe("Close");

		await setLocale({ locale: "de" });
		flushSync();
		expect(label.title).toBe("Schließen");

		stop();
		await setLocale({ locale: SOURCE_LOCALE });
		flushSync();
		expect(label.title).toBe("Schließen");
	});
});

describe("setLocale", () => {
	it("lists the source, translated and dev pseudo-locales", () => {
		expect(locales).toEqual([
			"ar",
			"ar-XB",
			"cs",
			"de",
			"en",
			"en-XA",
			"eo",
			"fr",
			"he",
			"ja",
			"pl",
			"pt-BR",
			"ru",
			"uk",
			"ur",
			"ur-Arab",
			"ur-Aran",
		]);
	});

	it("applies only the latest request", async () => {
		await Promise.all([
			setLocale({ locale: "de" }),
			setLocale({ locale: "ru" }),
			setLocale({ locale: "de" }),
		]);
		expect(getLocale()).toBe("de");

		const ru = setLocale({ locale: "ru" });
		const en = setLocale({ locale: "en" });
		expect(getLocale()).toBe("en");
		await Promise.all([ru, en]);
		expect(getLocale()).toBe("en");
	});

	it("rejects locales without translations", async () => {
		await expect(setLocale({ locale: "ru@formal" })).rejects.toThrow(
			RangeError,
		);
		await expect(setLocale({ locale: "pt" })).rejects.toThrow(RangeError);
		expect(getLocale()).toBe("en");
	});

	it.each([
		["ar", "rtl"],
		["he", "rtl"],
		["ur", "rtl"],
		["ur-Aran", "rtl"],
		["ur-Arab", "rtl"],
		["pt-BR", "ltr"],
		["ja", "ltr"],
		["en", "ltr"],
	])("sets lang and dir for %s", async (locale, dir) => {
		await setLocale({ locale });
		expect(document.documentElement.lang).toBe(locale);
		expect(document.documentElement.dir).toBe(dir);
	});
});

describe("t", () => {
	it("falls back to English key by key", async () => {
		await setLocale({ locale: "de" });
		expect(t("common.actions.close")).toBe("Schließen");
		expect(t("common.time.justNow")).toBe("Just now");
		expect(t("common.time.hours", { count: 3 })).toBe("3 hrs");
		await setLocale({ locale: "ru" });
		expect(translateFixture("sample.app.name")).toBe("Open Grind");
		expect(translateFixture("sample.photos", { count: 1.5 })).toBe(
			"1.5 photos",
		);
	});

	it("uses _zero for 0 wherever the key exists", async () => {
		expect(t("common.time.minutes", { count: 0 })).toBe("0 mins");
		await setLocale({ locale: "de" });
		expect(t("common.time.minutes", { count: 0 })).toBe("Keine Minuten");
		expect(t("common.time.minutes", { count: 1 })).toBe("1 Min.");
	});

	it("inserts each value literally into its own slot", () => {
		expect(
			translateFixture("sample.chat.greeting", { name: "$& {{name}}" }),
		).toBe("Say hi to $& {{name}}!");
		expect(translateFixture("sample.chat.greeting")).toBe(
			"Say hi to {{name}}!",
		);
	});

	it("renders the plain member of a key union given a count", () => {
		const keys = ["common.actions.close", "common.time.minutes"] as const;
		expect(keys.map((key) => t(key, { count: 3 }))).toEqual([
			"Close",
			"3 mins",
		]);
	});

	it("returns the full key when no catalog has it", () => {
		expect(translateFixture("sample.missing")).toBe("sample.missing");
		expect(translateFixture("nowhere")).toBe("nowhere");
	});

	it("formats only count, with the active locale", async () => {
		setCountFormatter(({ count, locale }) =>
			new Intl.NumberFormat(locale).format(count),
		);
		expect(t("common.time.minutes", { count: 1234 })).toBe("1,234 mins");
		expect(translateFixture("sample.chat.greeting", { name: 1234 })).toBe(
			"Say hi to 1234!",
		);
		await setLocale({ locale: "de" });
		expect(t("common.time.minutes", { count: 1234 })).toBe("1.234 Min.");
	});
});

describe("sourceText", () => {
	it("renders English whatever locale is active", async () => {
		setCountFormatter(({ count, locale }) =>
			new Intl.NumberFormat(locale).format(count),
		);
		await setLocale({ locale: "de" });
		expect(t("common.actions.close")).toBe("Schließen");
		expect(sourceText("common.actions.close")).toBe("Close");
		expect(sourceText("common.time.minutes", { count: 1234 })).toBe(
			"1,234 mins",
		);
	});
});

const COUNTS = [0, 1, 2, 3, 5, 11, 21, 22, 101, 1_000_000];

const RU_UK = {
	photos: [
		"F2:many 0",
		"F0:one 1",
		"F1:few 2",
		"F1:few 3",
		"F2:many 5",
		"F2:many 11",
		"F0:one 21",
		"F1:few 22",
		"F0:one 101",
		"F2:many 1000000",
	],
	unread: [
		"F2:many 0",
		"F0:one 1",
		"2 unread messages",
		"3 unread messages",
		"F2:many 5",
		"F2:many 11",
		"F0:one 21",
		"22 unread messages",
		"F0:one 101",
		"F2:many 1000000",
	],
};

const FR_PT = {
	photos: [
		"F0:one 0",
		"F0:one 1",
		"F2:other 2",
		"F2:other 3",
		"F2:other 5",
		"F2:other 11",
		"F2:other 21",
		"F2:other 22",
		"F2:other 101",
		"F1:many 1000000",
	],
	unread: [
		"F0:one 0",
		"F0:one 1",
		"F2:other 2",
		"F2:other 3",
		"F2:other 5",
		"F2:other 11",
		"F2:other 21",
		"F2:other 22",
		"F2:other 101",
		"1000000 unread messages",
	],
};

const WEBLATE_SAVED: Record<string, { photos: string[]; unread: string[] }> = {
	en: {
		photos: [
			"0 photos",
			"One photo",
			"2 photos",
			"3 photos",
			"5 photos",
			"11 photos",
			"21 photos",
			"22 photos",
			"101 photos",
			"1000000 photos",
		],
		unread: [
			"0 unread messages",
			"1 unread message",
			"2 unread messages",
			"3 unread messages",
			"5 unread messages",
			"11 unread messages",
			"21 unread messages",
			"22 unread messages",
			"101 unread messages",
			"1000000 unread messages",
		],
	},
	ar: {
		photos: [
			"F0:zero 0",
			"F1:one 1",
			"F2:two 2",
			"F3:few 3",
			"F3:few 5",
			"F4:many 11",
			"F4:many 21",
			"F4:many 22",
			"F5:other 101",
			"F5:other 1000000",
		],
		unread: [
			"F0:zero 0",
			"1 unread message",
			"F2:two 2",
			"F3:few 3",
			"F3:few 5",
			"F4:many 11",
			"F4:many 21",
			"F4:many 22",
			"F5:other 101",
			"F5:other 1000000",
		],
	},
	cs: {
		photos: [
			"F2:other 0",
			"F0:one 1",
			"F1:few 2",
			"F1:few 3",
			"F2:other 5",
			"F2:other 11",
			"F2:other 21",
			"F2:other 22",
			"F2:other 101",
			"F2:other 1000000",
		],
		unread: [
			"F2:other 0",
			"F0:one 1",
			"2 unread messages",
			"3 unread messages",
			"F2:other 5",
			"F2:other 11",
			"F2:other 21",
			"F2:other 22",
			"F2:other 101",
			"F2:other 1000000",
		],
	},
	fr: FR_PT,
	he: {
		photos: [
			"F2:other 0",
			"F0:one 1",
			"F1:two 2",
			"F2:other 3",
			"F2:other 5",
			"F2:other 11",
			"F2:other 21",
			"F2:other 22",
			"F2:other 101",
			"F2:other 1000000",
		],
		unread: [
			"F2:other 0",
			"F0:one 1",
			"2 unread messages",
			"F2:other 3",
			"F2:other 5",
			"F2:other 11",
			"F2:other 21",
			"F2:other 22",
			"F2:other 101",
			"F2:other 1000000",
		],
	},
	ja: {
		photos: COUNTS.map((count) => `F0:other ${count}`),
		unread: [
			"0 unread messages",
			"1 unread message",
			"2 unread messages",
			"3 unread messages",
			"5 unread messages",
			"11 unread messages",
			"21 unread messages",
			"22 unread messages",
			"101 unread messages",
			"1000000 unread messages",
		],
	},
	pl: {
		photos: [
			"F2:many 0",
			"F0:one 1",
			"F1:few 2",
			"F1:few 3",
			"F2:many 5",
			"F2:many 11",
			"F2:many 21",
			"F1:few 22",
			"F2:many 101",
			"F2:many 1000000",
		],
		unread: [
			"F2:many 0",
			"F0:one 1",
			"2 unread messages",
			"3 unread messages",
			"F2:many 5",
			"F2:many 11",
			"F2:many 21",
			"22 unread messages",
			"F2:many 101",
			"F2:many 1000000",
		],
	},
	"pt-BR": FR_PT,
	ru: RU_UK,
	uk: RU_UK,
};

describe("Weblate-saved files", () => {
	it.each(Object.entries(WEBLATE_SAVED))(
		"render %s form by form",
		async (locale, { photos, unread }) => {
			await setLocale({ locale });
			const render = (key: string) =>
				COUNTS.map((count) => translateFixture(key, { count }));
			expect(render("sample.photos")).toEqual(photos);
			expect(render("sample.chat.unread")).toEqual(unread);
		},
	);
});
