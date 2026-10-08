import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import { FIXTURES, readLocaleFiles, sourceFile } from "./locale-files";
import { checkTranslation, collectMessages } from "./source-messages";

const errorsOf = (json: unknown) => collectMessages([sourceFile(json)]).errors;

describe("collectMessages", () => {
	it("derives params, tags, wrapped params and plural counts", () => {
		const { messages, errors } = collectMessages([
			sourceFile({
				nested: { greeting: "Hi {{ name }} and {{name}}" },
				photos_one: "{{count}} photo by {{author}}",
				photos_other:
					"<b>{{count}}</b> photos by <link>the {{author}} page</link>",
				plain: "No params",
				videos_one: "One video",
				videos_other: "{{count}} videos",
			}),
		]);
		expect(errors).toEqual([]);
		expect(messages).toEqual([
			{
				key: "ns.nested.greeting",
				params: ["name"],
				tags: [],
				wrapped: [],
			},
			{
				key: "ns.photos",
				params: ["author", "count"],
				tags: ["b", "link"],
				wrapped: ["author", "count"],
			},
			{ key: "ns.plain", params: [], tags: [], wrapped: [] },
			{ key: "ns.videos", params: ["count"], tags: [], wrapped: [] },
		]);
	});

	it.each([
		[
			{ a_zero: "x", a_one: "x", a_other: "x" },
			"en/ns.a: plurals need exactly _one and _other, found _one, _other, _zero",
		],
		[
			{ a_other: "x" },
			"en/ns.a: plurals need exactly _one and _other, found _other",
		],
		[
			{ a_one: "x", a_few: "x", a_other: "x" },
			"en/ns.a: plurals need exactly _one and _other, found _few, _one, _other",
		],
		[
			{ a_one: "One by {{author}}", a_other: "{{count}} by {{author}}" },
			"en/ns.a_one: has a placeholder, so it needs {{count}} as well",
		],
		[
			{ a: "x", a_one: "x", a_other: "x" },
			"en/ns.a: a plain value and plural forms share this key",
		],
		[
			{ a_one: "x", a_other: "x", a: { b: "x" } },
			"en/ns.a: plural forms and nested keys share this key",
		],
		[
			{ group_one: { label: "x" } },
			"en/ns.group_one: holds nested keys, so it takes no plural suffix",
		],
		[{ a: "<b><i>x</i></b>" }, "en/ns.a: <i> is unbalanced or nested"],
		[{ a: "<b>x" }, "en/ns.a: <b> is never closed"],
		[{ a: "x</b>" }, "en/ns.a: </b> is unbalanced or nested"],
		[{ a: "<b>x</i>" }, "en/ns.a: </i> is unbalanced or nested"],
		[
			{ a: "line<br/>break" },
			"en/ns.a: <br/> is not a plain camelCase <name> or </name> tag",
		],
		[
			{ a: '<a href="/">x</a>' },
			'en/ns.a: <a href="/"> is not a plain camelCase <name> or </name> tag',
		],
		[
			{ a: "<Link>x</Link>" },
			"en/ns.a: <Link> is not a plain camelCase <name> or </name> tag",
		],
		[{ a: "<key>x</key>" }, "en/ns.a: <key> uses a reserved name"],
		[
			{ a: "<gridLink>Grid</gridLink> and {{gridLink}}" },
			"en/ns.a: <gridLink> and {{gridLink}} share a name",
		],
		[
			{
				a_one: "<views>{{count}} view</views>",
				a_other: "{{count}} {{views}}",
			},
			"en/ns.a: <views> and {{views}} share a name",
		],
		[
			{ a: "{{- name}}" },
			"en/ns.a: {{- name}} is not a plain camelCase {{name}} placeholder",
		],
		[
			{ a: "{{n, number}}" },
			"en/ns.a: {{n, number}} is not a plain camelCase {{name}} placeholder",
		],
		[
			{ a: "{{user.name}}" },
			"en/ns.a: {{user.name}} is not a plain camelCase {{name}} placeholder",
		],
		[
			{ a: "Hi {{userName}} and {{UserName}}" },
			"en/ns.a: {{UserName}} is not a plain camelCase {{name}} placeholder",
		],
		[
			{ a: "Hi {name}" },
			"en/ns.a: stray brace outside a {{name}} placeholder",
		],
		[
			{ a: "Hi {{name}" },
			"en/ns.a: stray brace outside a {{name}} placeholder",
		],
		[{ a: "$t(ns.b)" }, "en/ns.a: $t() nesting is not supported"],
		[
			{ a: "Fish &amp; chips" },
			"en/ns.a: &amp; is an HTML entity; write the character itself",
		],
		[
			{ a: "10&#160;km" },
			"en/ns.a: &#160; is an HTML entity; write the character itself",
		],
		[
			{ a: "10&#xA0;km" },
			"en/ns.a: &#xA0; is an HTML entity; write the character itself",
		],
		[
			{ a: "{{count}} new" },
			"en/ns.a: {{count}} needs plural forms ns.a_one/_other",
		],
		[{ a: "" }, "en/ns.a: empty string renders as the key"],
		[{ a: 1 }, "en/ns.a: values must be strings or objects"],
		[{ a: ["x"] }, "en/ns.a: values must be strings or objects"],
		[{ a: null }, "en/ns.a: values must be strings or objects"],
		["x", "en/ns.json: must hold a JSON object"],
		[["x"], "en/ns.json: must hold a JSON object"],
	])("rejects %j", (json, error) => {
		expect(errorsOf(json)).toEqual([error]);
	});

	it.each(["a.b", "a_b", "Upper"])(
		"rejects the key segment %s",
		(segment) => {
			expect(errorsOf({ [segment]: "x" })).toEqual([
				`en/ns.${segment}: key segments are camelCase [a-z][A-Za-z0-9]*, plus a plural suffix such as _one`,
			]);
		},
	);

	it.each([
		["icon", "Open the <icon></icon> menu."],
		["project", "Thanks to <project>{{name}}</project>!"],
		["link", "Track <link>#{{issue}}</link>."],
	])("rejects <%s> wrapping only what the app supplies", (tag, text) => {
		expect(errorsOf({ a: text })).toEqual([
			`en/ns.a: <${tag}> wraps no text; use a {{placeholder}} for what the app supplies`,
		]);
	});

	it.each(["a.b", "a-b", "Ab"])("rejects the namespace %s", (namespace) => {
		expect(collectMessages([{ namespace, text: "{}" }]).errors).toEqual([
			`en/${namespace}.json: file names are camelCase [a-z][A-Za-z0-9]*`,
		]);
	});

	it("rejects files that are not JSON", () => {
		expect(
			collectMessages([{ namespace: "ns", text: "{" }]).errors,
		).toEqual([expect.stringMatching(/^en\/ns\.json: invalid JSON: /)]);
	});
});

describe("checkTranslation", () => {
	const source = [
		sourceFile({
			plain: "Archived",
			greeting: "Say hi to {{name}}!",
			terms: "Accept the <link>terms</link> and the <b>policy</b>.",
			photos_one: "One photo",
			photos_other: "{{count}} photos",
			shared_one: "{{name}} shared {{count}} photo",
			shared_other: "{{name}} shared {{count}} photos",
			nested: { title: "Account" },
		}),
	];
	const check = (json: unknown, locale = "ru") =>
		checkTranslation({ locale, files: [sourceFile(json)], source });

	it.each([
		{
			plain: "",
			greeting: "{{name }}",
			photos_one: "{{count}} фото",
			photos_few: "",
			photos_many: "{{count}} фото",
			nested: { title: "Аккаунт" },
		},
		{ terms: "Примите <b>политику</b> и <link>условия</link>." },
		{ photos: "" },
		{ photos_zero: "Нет фото" },
		{ removed: "<i>Удалено</i>" },
	])("accepts %j", (json) => {
		expect(check(json).errors).toEqual([]);
	});

	it.each([
		[
			{ plain: "{{amount, currency}}" },
			"ru/ns.plain: {{amount, currency}} is not a plain camelCase {{name}} placeholder",
		],
		[
			{ plain: { short: "Архив" } },
			"ru/ns.plain: is an object where English has a message",
		],
		[
			{ photos: { short: "Фото" } },
			"ru/ns.photos: is an object where English has a message",
		],
		[
			{ photos_one: { short: "Фото" } },
			"ru/ns.photos_one: is an object where English has a message",
		],
		[
			{ photos_few: { short: "Фото" } },
			"ru/ns.photos_few: is an object where English has a message",
		],
		[
			{ terms: "<link>Условия</link>, <b>политика</b> и <i>правила</i>" },
			"ru/ns.terms: <i> is not in the English message",
		],
		[
			{ plain: "<b>Архив</b>" },
			"ru/ns.plain: <b> is not in the English message",
		],
		[
			{ photos_few: "<b>{{count}}</b> фото" },
			"ru/ns.photos_few: <b> is not in the English message",
			"ru/ns.photos_few: {{count}} is inside a tag, which English never does",
		],
		[
			{ greeting: "Привет, {{name}} и {{nmae}}!" },
			"ru/ns.greeting: {{nmae}} is not in the English message",
		],
		["x", "ru/ns.json: must hold a JSON object"],
	])("rejects %j", (json, ...errors) => {
		expect(check(json).errors).toEqual(errors);
	});

	it.each([
		[
			{ greeting: "Привет!" },
			["ru/ns.greeting: lacks {{name}} from the English message"],
		],
		[
			{ greeting: "Привет, {{nmae}}!" },
			[
				"ru/ns.greeting: {{nmae}} is not in the English message",
				"ru/ns.greeting: lacks {{name}} from the English message",
			],
		],
		[
			{ terms: "Примите <link>условия</link>." },
			["ru/ns.terms: lacks <b> from the English message"],
		],
		[
			{ terms: "Примите условия." },
			[
				"ru/ns.terms: lacks <b> from the English message",
				"ru/ns.terms: lacks <link> from the English message",
			],
		],
		[
			{ photos_one: "Одно фото" },
			["ru/ns.photos_one: lacks {{count}} from the English message"],
		],
		[
			{ photos_few: "{{n}} фото" },
			[
				"ru/ns.photos_few: {{n}} is not in the English message",
				"ru/ns.photos_few: lacks {{count}} from the English message",
			],
		],
		[
			{ shared_one: "Одно фото" },
			[
				"ru/ns.shared_one: lacks {{count}} from the English message",
				"ru/ns.shared_one: lacks {{name}} from the English message",
			],
		],
		[
			{ nested: "Аккаунт" },
			["ru/ns.nested: is a string where English has an object"],
		],
	])("reports drift in %j", (json, errors) => {
		expect(check(json).errors).toEqual(errors);
	});

	it.each([
		[
			"de",
			{
				photos_one: "Ein Foto",
				shared_one: "{{name}} hat ein Foto geteilt",
			},
		],
		["cs", { photos_one: "Jedna fotka" }],
		["he", { photos_one: "תמונה אחת", photos_two: "שתי תמונות" }],
		[
			"ar",
			{
				photos_zero: "لا صور",
				photos_one: "صورة واحدة",
				photos_two: "صورتان",
			},
		],
	])(
		"lets %s omit {{count}} where a form covers one number",
		(locale, json) => {
			expect(check(json, locale).errors).toEqual([]);
		},
	);

	it.each([
		["fr", { photos_one: "Une photo" }, "photos_one", "count"],
		["pt-BR", { photos_one: "Uma foto" }, "photos_one", "count"],
		["fr", { photos_many: "Un million de photos" }, "photos_many", "count"],
		["de", { shared_one: "Ein Foto geteilt" }, "shared_one", "name"],
		["ar", { photos_few: "بضع صور" }, "photos_few", "count"],
	])(
		"still requires the English params in %s %j",
		(locale, json, key, param) => {
			expect(check(json, locale).errors).toEqual([
				`${locale}/ns.${key}: lacks {{${param}}} from the English message`,
			]);
		},
	);

	it.each([
		["de", { photos_one: "Ein Foto" }, []],
		[
			"ru",
			{ photos_one: "Одно фото" },
			[
				"ru/ns.photos_one: lacks <b> from the English message",
				"ru/ns.photos_one: lacks {{count}} from the English message",
				"ru/ns.photos_one: lacks {{name}} from the English message",
			],
		],
		[
			"ar",
			{ photos_zero: "لا صور" },
			[
				"ar/ns.photos_zero: lacks <b> from the English message",
				"ar/ns.photos_zero: lacks {{name}} from the English message",
			],
		],
	])(
		"compares %s %j with the English forms for the same counts",
		(locale, json, errors) => {
			const english = sourceFile({
				photos_one: "One photo",
				photos_other: "<b>{{count}}</b> photos from {{name}}",
			});
			expect(
				checkTranslation({
					locale,
					files: [sourceFile(json)],
					source: [english],
				}).errors,
			).toEqual(errors);
		},
	);

	it.each([
		[
			{ photos_one: "{{count}} фото" },
			"ru/ns.photos: no text for _few, _many, so those counts render in English",
		],
		[
			{
				photos_one: "{{count}} фото",
				photos_few: "",
				photos_many: "{{count}} фото",
			},
			"ru/ns.photos: no text for _few, so those counts render in English",
		],
		[
			{ photos_zero: "Нет фото" },
			"ru/ns.photos_zero: Weblate offers no _zero form for ru and drops it on save",
		],
		[
			{ photos_other: "{{count}} фото" },
			"ru/ns.photos_other: Weblate offers no _other form for ru and drops it on save",
		],
		[
			{ removed: "Удалено" },
			"ru/ns.removed: English no longer has this key",
		],
		[{ photos: "Фото" }, "ru/ns.photos: English no longer has this key"],
		[
			{ plain_few: "{{x}} <b>Архивы</b>" },
			"ru/ns.plain_few: English no longer has this key",
		],
		[{ plain: "" }, "ru/ns.plain: empty, so it renders in English"],
		[
			{ photos_one: "", photos_few: "", photos_many: "" },
			[
				"ru/ns.photos_few: empty, so it renders in English",
				"ru/ns.photos_many: empty, so it renders in English",
				"ru/ns.photos_one: empty, so it renders in English",
			],
		],
	])("warns about %j", (json, warning) => {
		expect(check(json)).toMatchObject({
			errors: [],
			warnings: [warning].flat(),
		});
	});

	it("counts messages with every Weblate form filled as translated", () => {
		const partial = {
			plain: "Архив",
			greeting: "",
			photos_one: "{{count}} фото",
			photos_few: "{{count}} фото",
			nested: { title: "Аккаунт" },
		};
		expect(check({})).toMatchObject({ translated: 0, total: 6 });
		expect(check(partial)).toMatchObject({ translated: 2, total: 6 });
		expect(
			check({ ...partial, photos_many: "{{count}} фото" }),
		).toMatchObject({ translated: 3, total: 6 });
	});

	it.each(["pt_BR", "ru@formal", "PT-br", "en_US"])(
		"rejects the locale directory %s",
		(locale) => {
			expect(
				checkTranslation({ locale, files: [sourceFile({})], source })
					.errors,
			).toEqual([
				`${locale}: not a canonical BCP 47 tag; set Weblate's language code style to BCP`,
			]);
		},
	);

	it("rejects namespaces without an English source", () => {
		expect(
			checkTranslation({
				locale: "ru",
				files: [{ namespace: "extra", text: '{ "a": "x" }' }],
				source,
			}).errors,
		).toEqual(["ru/extra.json: has no English source file"]);
	});
});

describe("Weblate-saved files", () => {
	const fixtures = readLocaleFiles(FIXTURES);
	const source = fixtures.get(SOURCE_LOCALE) ?? [];

	it("covers the plural shapes of ten languages", () => {
		expect([...fixtures.keys()]).toEqual([
			"ar",
			"cs",
			"en",
			"fr",
			"he",
			"ja",
			"pl",
			"pt-BR",
			"ru",
			"uk",
		]);
	});

	it("accepts the English template", () => {
		const { messages, errors } = collectMessages(source);
		expect(errors).toEqual([]);
		expect(messages.map(({ key }) => key)).toEqual([
			"sample.app.name",
			"sample.app.tagline",
			"sample.chat.greeting",
			"sample.chat.shared",
			"sample.chat.typing",
			"sample.chat.unread",
			"sample.inbox.archived",
			"sample.inbox.empty",
			"sample.photos",
			"sample.settings.consent",
			"sample.settings.theme.dark",
			"sample.settings.theme.light",
		]);
		expect(messages).toContainEqual({
			key: "sample.settings.consent",
			params: [],
			tags: ["privacy", "terms"],
			wrapped: [],
		});
	});

	it.each([
		[
			"ar",
			"ar/sample.chat.unread: no text for _one, so those counts render in English",
		],
		[
			"cs",
			"cs/sample.chat.unread: no text for _few, so those counts render in English",
		],
		[
			"fr",
			"fr/sample.chat.unread: no text for _many, so those counts render in English",
		],
		[
			"he",
			"he/sample.chat.unread: no text for _two, so those counts render in English",
		],
		["ja", "ja/sample.chat.unread_other: empty, so it renders in English"],
		[
			"pl",
			"pl/sample.chat.unread: no text for _few, so those counts render in English",
		],
		[
			"pt-BR",
			"pt-BR/sample.chat.unread: no text for _many, so those counts render in English",
		],
		[
			"ru",
			"ru/sample.chat.unread: no text for _few, so those counts render in English",
		],
		[
			"uk",
			"uk/sample.chat.unread: no text for _few, so those counts render in English",
		],
	])(
		"accepts %s and warns only about its cleared form",
		(locale, warning) => {
			const files = fixtures.get(locale) ?? [];
			expect(checkTranslation({ locale, files, source })).toEqual({
				errors: [],
				warnings: [warning],
				translated: 1,
				total: 12,
			});
		},
	);
});
