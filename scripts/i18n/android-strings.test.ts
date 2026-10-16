import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import {
	ANDROID_MANIFEST,
	ANDROID_RES,
	androidDrift,
	androidQualifier,
	checkAndroidManifest,
	declaredStrings,
	renderAndroidStrings,
	stringsFileOf,
} from "./android-strings";
import { LOCALES, sourceFile } from "./locale-files";
import { catalogTexts, collectMessages } from "./source-messages";

const textsOf = (json: unknown) => catalogTexts([sourceFile(json)]);

const documentOf = (...elements: string[]) =>
	[
		'<?xml version="1.0" encoding="utf-8"?>',
		"<resources>",
		...elements.map((line) => `\t${line}`),
		"</resources>",
		"",
	].join("\n");

const renderEnglish = ({
	manifest,
	json,
}: {
	manifest: Record<string, string>;
	json: unknown;
}) => {
	const english = textsOf(json);
	return renderAndroidStrings({
		manifest: new Map(Object.entries(manifest)),
		texts: english,
		english,
	});
};

const QUALIFIERS = [
	["ar", "ar"],
	["cs", "cs"],
	["da", "da"],
	["de", "de"],
	["en-GB", "en-rGB"],
	["es", "es"],
	["es-419", "b+es+419"],
	["fil", "fil"],
	["fr", "fr"],
	["hi", "hi"],
	["id", "in"],
	["it", "it"],
	["ja", "ja"],
	["ko", "ko"],
	["ms", "ms"],
	["nb", "nb"],
	["nl", "nl"],
	["pl", "pl"],
	["pt-BR", "pt-rBR"],
	["pt-PT", "pt-rPT"],
	["ru", "ru"],
	["sv", "sv"],
	["th", "th"],
	["uk", "uk"],
	["vi", "vi"],
	["zh-Hans", "b+zh+Hans"],
	["zh-Hant", "b+zh+Hant"],
] as const;

describe("androidQualifier", () => {
	it("pins the qualifier of every translated directory", () => {
		expect(
			QUALIFIERS.map(([directory]) => androidQualifier(directory)),
		).toEqual(QUALIFIERS.map(([, qualifier]) => qualifier));
	});

	it.each([
		["he", "iw"],
		["he-IL", "iw-rIL"],
		["yi", "ji"],
		["id-ID", "in-rID"],
		["fil-PH", "fil-rPH"],
		["en", "en"],
		["sr-Latn", "b+sr+Latn"],
		["zh-Hant-HK", "b+zh+Hant+HK"],
		["ca-ES-valencia", "b+ca+ES+valencia"],
	])("maps %s to %s", (directory, qualifier) => {
		expect(androidQualifier(directory)).toBe(qualifier);
	});

	it("gives every catalog directory a qualifier aapt2 parses", () => {
		const directories = readdirSync(LOCALES).filter(
			(directory) => directory !== SOURCE_LOCALE,
		);
		expect(directories.length).toBeGreaterThan(0);
		for (const directory of directories) {
			expect(androidQualifier(directory)).toMatch(
				/^(?:[a-z]{2,3}(?:-r[A-Z]{2})?|b\+[a-z]{2,3}(?:\+[A-Za-z0-9]{2,8})+)$/,
			);
		}
	});
});

describe("renderAndroidStrings", () => {
	it.each([
		["Can't stop", "Can\\'t stop"],
		['Say "hi"', 'Say \\"hi\\"'],
		["@home", "\\@home"],
		["?why", "\\?why"],
		["mail@home?", "mail@home?"],
		["a\nb", "a\\nb"],
		["a\tb", "a\\tb"],
		["a\\b", "a\\\\b"],
		["a\u0001b\rc", "a\\u0001b\\u000Dc"],
		["a  b ", '"a  b "'],
		[" lead", '" lead"'],
		["@ home ", '"\\@ home "'],
		["1 < 2 & 3 > 0", "1 &lt; 2 &amp; 3 &gt; 0"],
		["<b>bold</b>", "&lt;b&gt;bold&lt;/b&gt;"],
		["Can’t “quote” … 5′11″", "Can’t “quote” … 5′11″"],
		["5 km", "5 km"],
		["{{name}} is 50% done", "%1$s is 50%% done"],
		["{{ name }} and {{name}}", "%1$s and %1$s"],
		["{{a}} {{b}}, {{a}}", "%1$s %2$s, %1$s"],
		["{{version}} of {{provider}}", "%2$s of %1$s"],
		["{{a}}  {{b}} ", '"%1$s  %2$s "'],
	])("writes %j as %s", (input, value) => {
		expect(
			renderEnglish({
				manifest: { probe: "ns.probe" },
				json: { probe: input },
			}),
		).toEqual({
			text: documentOf(`<string name="probe">${value}</string>`),
			errors: [],
		});
	});

	it("marks percent text without placeholders as not formatted", () => {
		expect(
			renderEnglish({
				manifest: { probe: "ns.probe" },
				json: { probe: "50% done" },
			}).text,
		).toBe(
			documentOf(
				'<string name="probe" formatted="false">50% done</string>',
			),
		);
	});

	it("sorts by resource name and lets one message back two names", () => {
		expect(
			renderEnglish({
				manifest: {
					push_self: "ns.you",
					channel_taps: "ns.taps",
					push_body_tap: "ns.taps",
				},
				json: { taps: "Tapped you", you: "You" },
			}).text,
		).toBe(
			documentOf(
				'<string name="channel_taps">Tapped you</string>',
				'<string name="push_body_tap">Tapped you</string>',
				'<string name="push_self">You</string>',
			),
		);
	});

	it("writes an empty resources element for an empty manifest", () => {
		expect(renderEnglish({ manifest: {}, json: { a: "A" } }).text).toBe(
			documentOf(),
		);
	});

	describe("a translation", () => {
		const english = textsOf({
			shared: "{{name}} shared {{album}}",
			done: "Done",
			percent: "{{level}} at 50%",
			plain: "Plain",
			gone: "Gone",
			empty: "Empty",
		});
		const manifest = new Map([
			["album_shared", "ns.shared"],
			["done", "ns.done"],
			["percent", "ns.percent"],
			["plain", "ns.plain"],
			["gone", "ns.gone"],
			["empty", "ns.empty"],
		]);
		const translate = (json: unknown) =>
			renderAndroidStrings({ manifest, texts: textsOf(json), english });

		it("numbers placeholders by name, so a translation can move them", () => {
			expect(
				translate({
					shared: "{{album}} compartido por {{name}}",
					done: "Listo",
				}).text,
			).toBe(
				documentOf(
					'<string name="album_shared">%1$s compartido por %2$s</string>',
					'<string name="done">Listo</string>',
				),
			);
		});

		it("omits messages the catalog lacks or leaves empty", () => {
			expect(translate({ done: "Listo", empty: "" })).toEqual({
				text: documentOf('<string name="done">Listo</string>'),
				errors: [],
			});
		});

		it("omits a text with a placeholder English lacks", () => {
			expect(
				translate({ shared: "{{nombre}} compartió {{album}}" }).text,
			).toBe(documentOf());
		});

		it("formats percent signs by the English placeholders", () => {
			expect(translate({ percent: "50 %", plain: "100 %" }).text).toBe(
				documentOf(
					'<string name="percent">50 %%</string>',
					'<string name="plain" formatted="false">100 %</string>',
				),
			);
		});

		it("reports a lone surrogate by key and leaves the text out", () => {
			expect(
				translate({ done: "Listo \uD83D", plain: "Sencillo" }),
			).toEqual({
				text: documentOf('<string name="plain">Sencillo</string>'),
				errors: [
					"ns.done: has a lone surrogate \\uD83D, which Android cannot store; retype the character",
				],
			});
		});

		it.each([
			["\uFFFE", "FFFE"],
			["\uFFFF", "FFFF"],
		])(
			"reports the noncharacter %j by key and leaves the text out",
			(noncharacter, code) => {
				expect(
					translate({
						done: `Listo${noncharacter}`,
						plain: "Sencillo",
					}),
				).toEqual({
					text: documentOf('<string name="plain">Sencillo</string>'),
					errors: [
						`ns.done: has the noncharacter \\u${code}, which Android cannot store; delete it`,
					],
				});
			},
		);

		it("keeps a surrogate pair", () => {
			expect(translate({ done: "Listo 🎉" }).text).toBe(
				documentOf('<string name="done">Listo 🎉</string>'),
			);
		});
	});
});

describe("checkAndroidManifest", () => {
	const { messages } = collectMessages([
		sourceFile({
			you: "You",
			sent: "{{name}} sent a photo",
			photos_one: "One photo",
			photos_other: "{{count}} photos",
			rules: "Read <link>the rules</link>",
		}),
	]);
	const declared = new Map([
		["app_name", "src-tauri/gen/android/app/src/main/res/values/brand.xml"],
	]);
	const check = (manifest: unknown) =>
		checkAndroidManifest({
			text: JSON.stringify(manifest),
			messages,
			declared,
		});

	it("returns the entries of a valid manifest", () => {
		expect(
			check({
				push_self: "ns.you",
				push_sent: "ns.sent",
				self_2: "ns.you",
			}),
		).toEqual({
			manifest: new Map([
				["push_self", "ns.you"],
				["push_sent", "ns.sent"],
				["self_2", "ns.you"],
			]),
			errors: [],
		});
	});

	it.each([
		[
			{ "Push-Self": "ns.you" },
			"android-strings.json: Push-Self: is not an Android resource name; use lowercase letters, digits and _, starting with a letter, such as push_self",
		],
		[
			{ _self: "ns.you" },
			"android-strings.json: _self: is not an Android resource name; use lowercase letters, digits and _, starting with a letter, such as push_self",
		],
		[
			{ push_self: "ns.me" },
			"android-strings.json: push_self: ns.me is not a message in locales/en; fix the key or add the message",
		],
		[
			{ push_photo: "ns.photos_one" },
			"android-strings.json: push_photo: ns.photos_one is not a message in locales/en; fix the key or add the message",
		],
		[
			{ push_photos: "ns.photos" },
			"android-strings.json: push_photos: ns.photos is a plural group, which is not supported until a native plural exists; map a message without {{count}}",
		],
		[
			{ push_rules: "ns.rules" },
			"android-strings.json: push_rules: ns.rules has <link>, which Android text cannot show; map a message without tags",
		],
		[
			{ app_name: "ns.you" },
			"android-strings.json: app_name: is also declared in src-tauri/gen/android/app/src/main/res/values/brand.xml; rename it here or remove it there",
		],
		[
			{ push_self: 3 },
			'android-strings.json: push_self: 3 is not a message key such as "chat.notification.you"',
		],
	])("rejects %j", (manifest, error) => {
		expect(check(manifest)).toEqual({
			manifest: new Map(),
			errors: [error],
		});
	});

	it("keeps the valid entries next to a rejected one", () => {
		expect(check({ push_self: "ns.you", bad: "ns.me" }).manifest).toEqual(
			new Map([["push_self", "ns.you"]]),
		);
	});

	it.each([
		["not JSON", "{", /^android-strings\.json: is not valid JSON: /],
		[
			"an array",
			"[]",
			/^android-strings\.json: must hold an object of Android resource names and message keys, such as \{"push_self": "chat\.notification\.you"\}$/,
		],
	])("rejects a manifest that is %s", (_name, text, error) => {
		const { manifest, errors } = checkAndroidManifest({
			text,
			messages,
			declared,
		});
		expect(manifest).toEqual(new Map());
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(error);
	});
});

describe("stringsFileOf", () => {
	it("puts a translation in the folder of its qualifier", () => {
		expect(stringsFileOf("es-419")).toBe(
			`${ANDROID_RES}/values-b+es+419/strings.xml`,
		);
	});
});

describe("declaredStrings", () => {
	it("names the file of each string, whatever its attribute order", () => {
		expect(
			declaredStrings([
				{
					file: "values/brand.xml",
					text: [
						'<string translatable="false" name="app_name">A</string>',
						'<string name="main_activity_title">B</string>',
						'<string-array name="choices"/>',
						'<plurals name="photos"/>',
					].join("\n"),
				},
				{
					file: "values/other.xml",
					text: '<string name="extra">C</string>',
				},
			]),
		).toEqual(
			new Map([
				["app_name", "values/brand.xml"],
				["main_activity_title", "values/brand.xml"],
				["extra", "values/other.xml"],
			]),
		);
	});
});

describe("androidDrift", () => {
	const english = { file: "values/strings.xml", text: "en" };
	const german = { file: "values-de/strings.xml", text: "de" };
	const current = { [english.file]: "en", [german.file]: "de" };
	const drift = ({
		existing,
		release = false,
	}: {
		existing: Record<string, string>;
		release?: boolean;
	}) =>
		androidDrift({
			english,
			translated: [german],
			existing: new Map(Object.entries(existing)),
			release,
		});
	const nothing = { errors: [], warnings: [], writes: [], deletes: [] };

	it("reports nothing when every file is current", () => {
		expect(drift({ existing: current })).toEqual(nothing);
		expect(drift({ existing: current, release: true })).toEqual(nothing);
	});

	it("fails on an out-of-date English file", () => {
		expect(
			drift({ existing: { ...current, [english.file]: "old" } }),
		).toEqual({
			...nothing,
			errors: ["values/strings.xml is out of date."],
			writes: [english],
		});
	});

	it("fails on a missing English file", () => {
		expect(drift({ existing: { [german.file]: "de" } })).toEqual({
			...nothing,
			errors: ["values/strings.xml is missing."],
			writes: [english],
		});
	});

	it("only warns about an out-of-date translated file", () => {
		expect(
			drift({ existing: { ...current, [german.file]: "old" } }),
		).toEqual({
			...nothing,
			warnings: [
				"values-de/strings.xml: is out of date, so Android shows older text; run `bun run gen:i18n` and commit the result before a release",
			],
			writes: [german],
		});
	});

	it("fails on an out-of-date translated file in a release", () => {
		expect(
			drift({
				existing: { ...current, [german.file]: "old" },
				release: true,
			}),
		).toEqual({
			...nothing,
			errors: ["values-de/strings.xml is out of date."],
			writes: [german],
		});
	});

	it("fails on a shipped language without a file", () => {
		expect(drift({ existing: { [english.file]: "en" } })).toEqual({
			...nothing,
			errors: ["values-de/strings.xml is missing."],
			writes: [german],
		});
	});

	it("deletes and fails on a file of a language that is not shipped", () => {
		expect(
			drift({
				existing: {
					...current,
					"values-fr/strings.xml": "fr",
					"values-ar/strings.xml": "ar",
				},
			}),
		).toEqual({
			...nothing,
			errors: [
				"values-ar/strings.xml is for a language that shipped.json doesn’t list.",
				"values-fr/strings.xml is for a language that shipped.json doesn’t list.",
			],
			deletes: ["values-ar/strings.xml", "values-fr/strings.xml"],
		});
	});
});

describe("the Android app", () => {
	const root = path.join(import.meta.dirname, "../..");
	const main = path.join(root, "src-tauri/gen/android/app/src/main");
	const read = (file: string) => readFileSync(file, "utf8");
	const mapped = Object.keys(
		JSON.parse(read(path.join(root, ANDROID_MANIFEST))) as object,
	);
	const brand = declaredStrings([
		{
			file: "brand.xml",
			text: read(path.join(root, ANDROID_RES, "values/brand.xml")),
		},
	]);
	const namesIn = ({
		files,
		pattern,
	}: {
		files: string[];
		pattern: RegExp;
	}) =>
		files.flatMap((file) =>
			[...read(path.join(main, file)).matchAll(pattern)].map(
				([, name = ""]) => name,
			),
		);
	const kotlin = namesIn({
		files: globSync("java/**/*.kt", { cwd: main }),
		pattern: /(?<!android\.)\bR\.string\.(\w+)/g,
	});
	const xml = namesIn({
		files: [
			"AndroidManifest.xml",
			...globSync("res/layout/*.xml", { cwd: main }),
		],
		pattern: /@string\/(\w+)/g,
	});
	const referenced = new Set([...kotlin, ...xml]);

	it("reads references from Kotlin and from XML", () => {
		expect(kotlin).toContain("push_self");
		expect(xml).toContain("app_name");
		expect(brand.has("app_name")).toBe(true);
	});

	it("declares every string resource it references", () => {
		expect(
			[...referenced].filter(
				(name) => !mapped.includes(name) && !brand.has(name),
			),
		).toEqual([]);
	});

	it("references every string resource the manifest maps", () => {
		expect(mapped.filter((name) => !referenced.has(name))).toEqual([]);
	});
});
