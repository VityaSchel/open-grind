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
			"en/ns.a: English plurals need exactly _one and _other, found _one, _other, _zero",
		],
		[
			{ a_other: "x" },
			"en/ns.a: English plurals need exactly _one and _other, found _other",
		],
		[
			{ a_one: "x", a_few: "x", a_other: "x" },
			"en/ns.a: English plurals need exactly _one and _other, found _few, _one, _other",
		],
		[
			{ a_one: "One by {{author}}", a_other: "{{count}} by {{author}}" },
			"en/ns.a_one: has a placeholder, so it needs {{count}} as well",
		],
		[
			{ a: "x", a_one: "x", a_other: "x" },
			"en/ns.a: is used by both a plain value and plural forms; keep one of them",
		],
		[
			{ a_one: "x", a_other: "x", a: { b: "x" } },
			"en/ns.a: is used by both plural forms and nested keys; rename one of them",
		],
		[
			{ group_one: { label: "x" } },
			"en/ns.group_one: holds nested keys, so drop its plural suffix",
		],
		[
			{ a: "<b><i>x</i></b>" },
			"en/ns.a: <i> opens inside <b>, but tags cannot nest",
		],
		[
			{ a: "<b>x" },
			"en/ns.a: <b> is never closed; add </b> after its text",
		],
		[{ a: "x</b>" }, "en/ns.a: </b> has no matching <b> before it"],
		[{ a: "<b>x</i>" }, "en/ns.a: </i> does not match the open <b>"],
		[
			{ a: "line<br/>break" },
			"en/ns.a: <br/> is not a valid tag; write <camelCaseName> or </camelCaseName> with no attributes",
		],
		[
			{ a: '<a href="/">x</a>' },
			'en/ns.a: <a href="/"> is not a valid tag; write <camelCaseName> or </camelCaseName> with no attributes',
		],
		[
			{ a: "<Link>x</Link>" },
			"en/ns.a: <Link> is not a valid tag; write <camelCaseName> or </camelCaseName> with no attributes",
		],
		[
			{ a: "<key>x</key>" },
			"en/ns.a: <key> is reserved for a Rich.svelte prop; pick another name",
		],
		[
			{ a: "<gridLink>Grid</gridLink> and {{gridLink}}" },
			"en/ns.a: <gridLink> and {{gridLink}} share a name; rename one of them",
		],
		[
			{
				a_one: "<views>{{count}} view</views>",
				a_other: "{{count}} {{views}}",
			},
			"en/ns.a: <views> and {{views}} share a name; rename one of them",
		],
		[
			{ a: "{{- name}}" },
			"en/ns.a: {{- name}} is not a valid placeholder; write {{camelCaseName}} with no format options",
		],
		[
			{ a: "{{n, number}}" },
			"en/ns.a: {{n, number}} is not a valid placeholder; write {{camelCaseName}} with no format options",
		],
		[
			{ a: "{{user.name}}" },
			"en/ns.a: {{user.name}} is not a valid placeholder; write {{camelCaseName}} with no format options",
		],
		[
			{ a: "Hi {{userName}} and {{UserName}}" },
			"en/ns.a: {{UserName}} is not a valid placeholder; write {{camelCaseName}} with no format options",
		],
		[
			{ a: "Hi {name}" },
			"en/ns.a: has a { or } that is not part of a {{name}} placeholder",
		],
		[
			{ a: "Hi {{name}" },
			"en/ns.a: has a { or } that is not part of a {{name}} placeholder",
		],
		[
			{ a: "$t(ns.b)" },
			"en/ns.a: $t() is not supported; write the referenced text out in full",
		],
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
			"en/ns.a: has {{count}}, so split it into ns.a_one and ns.a_other",
		],
		[
			{ a: "" },
			"en/ns.a: is empty and would show as the key; write the text",
		],
		[
			{ a: 1 },
			"en/ns.a: must be a string or an object of keys, not a number",
		],
		[
			{ a: ["x"] },
			"en/ns.a: must be a string or an object of keys, not an array",
		],
		[
			{ a: null },
			"en/ns.a: must be a string or an object of keys, not null",
		],
		["x", "en/ns.json: must hold a JSON object"],
		[["x"], "en/ns.json: must hold a JSON object"],
	])("rejects %j", (json, error) => {
		expect(errorsOf(json)).toEqual([error]);
	});

	it.each(["a.b", "a_b", "Upper"])(
		"rejects the key segment %s",
		(segment) => {
			expect(errorsOf({ [segment]: "x" })).toEqual([
				`en/ns.${segment}: ${segment} is not a camelCase key; write it like sendButton, or photos_one for a plural form`,
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
			`en/${namespace}.json: ${namespace} is not a camelCase file name such as chat or profileEditor`,
		]);
	});

	it("rejects files that are not JSON", () => {
		expect(
			collectMessages([{ namespace: "ns", text: "{" }]).errors,
		).toEqual([
			expect.stringMatching(/^en\/ns\.json: is not valid JSON: /),
		]);
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
			"ru/ns.plain: {{amount, currency}} is not a valid placeholder; write {{camelCaseName}} with no format options",
		],
		[
			{ plain: { short: "Архив" } },
			"ru/ns.plain: is an object, but English has a message here; remove the object",
		],
		[
			{ photos: { short: "Фото" } },
			"ru/ns.photos: is an object, but English has a message here; remove the object",
		],
		[
			{ photos_one: { short: "Фото" } },
			"ru/ns.photos_one: is an object, but English has a message here; remove the object",
		],
		[
			{ photos_few: { short: "Фото" } },
			"ru/ns.photos_few: is an object, but English has a message here; remove the object",
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
			"ru/ns.photos_few: move {{count}} out of its tag, as in the English message",
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
			[
				"ru/ns.nested: is a string, but English has nested keys here; remove the string",
			],
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
			"ru/ns.photos: has no text for _few, _many, so those counts show in English",
		],
		[
			{
				photos_one: "{{count}} фото",
				photos_few: "",
				photos_many: "{{count}} фото",
			},
			"ru/ns.photos: has no text for _few, so those counts show in English",
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
			"ru/ns.removed: English no longer has this key, so nothing shows it",
		],
		[
			{ photos: "Фото" },
			"ru/ns.photos: English no longer has this key, so nothing shows it",
		],
		[
			{ plain_few: "{{x}} <b>Архивы</b>" },
			"ru/ns.plain_few: English no longer has this key, so nothing shows it",
		],
		[{ plain: "" }, "ru/ns.plain: is empty, so it shows in English"],
		[
			{ photos_one: "", photos_few: "", photos_many: "" },
			[
				"ru/ns.photos_few: is empty, so it shows in English",
				"ru/ns.photos_many: is empty, so it shows in English",
				"ru/ns.photos_one: is empty, so it shows in English",
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

	it.each([
		[
			"pt_BR",
			"pt_BR: the directory name is not a canonical BCP 47 tag such as pt-BR; set Weblate's language code style to BCP",
		],
		[
			"PT-br",
			"PT-br: the directory name is not a canonical BCP 47 tag such as pt-BR; set Weblate's language code style to BCP",
		],
		[
			"en_US",
			"en_US: the directory name is not a canonical BCP 47 tag such as pt-BR; set Weblate's language code style to BCP",
		],
		[
			"ru@formal",
			"ru@formal: a locale with @ breaks Intl; exclude it with Weblate's language filter",
		],
	])("rejects the locale directory %s", (locale, error) => {
		expect(
			checkTranslation({ locale, files: [sourceFile({})], source })
				.errors,
		).toEqual([error]);
	});

	it("rejects namespaces without an English source", () => {
		expect(
			checkTranslation({
				locale: "ru",
				files: [{ namespace: "extra", text: '{ "a": "x" }' }],
				source,
			}).errors,
		).toEqual([
			"ru/extra.json: has no English en/extra.json; rename or remove it",
		]);
	});
});

describe("Weblate-saved files", () => {
	const fixtures = readLocaleFiles(FIXTURES);
	const source = fixtures.get(SOURCE_LOCALE) ?? [];

	it("covers the plural shapes of ten languages and Spanish", () => {
		expect([...fixtures.keys()]).toEqual([
			"ar",
			"cs",
			"en",
			"es-419",
			"es",
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
			"ar/sample.chat.unread: has no text for _one, so those counts show in English",
		],
		[
			"cs",
			"cs/sample.chat.unread: has no text for _few, so those counts show in English",
		],
		[
			"fr",
			"fr/sample.chat.unread: has no text for _many, so those counts show in English",
		],
		[
			"he",
			"he/sample.chat.unread: has no text for _two, so those counts show in English",
		],
		["ja", "ja/sample.chat.unread_other: is empty, so it shows in English"],
		[
			"pl",
			"pl/sample.chat.unread: has no text for _few, so those counts show in English",
		],
		[
			"pt-BR",
			"pt-BR/sample.chat.unread: has no text for _many, so those counts show in English",
		],
		[
			"ru",
			"ru/sample.chat.unread: has no text for _few, so those counts show in English",
		],
		[
			"uk",
			"uk/sample.chat.unread: has no text for _few, so those counts show in English",
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

	it("checks es and es-419 each against English alone", () => {
		expect(
			["es", "es-419"].map((locale) =>
				checkTranslation({
					locale,
					files: fixtures.get(locale) ?? [],
					source,
				}),
			),
		).toEqual([
			{ errors: [], warnings: [], translated: 3, total: 12 },
			{ errors: [], warnings: [], translated: 4, total: 12 },
		]);
	});

	it("names es-419 before English for gaps in es", () => {
		expect(
			checkTranslation({
				locale: "es",
				files: [
					{
						namespace: "sample",
						text: JSON.stringify({
							photos_one: "Una foto",
							photos_other: "{{count}} fotos",
						}),
					},
				],
				source,
			}).warnings,
		).toEqual([
			"es/sample.photos: has no text for _many, so those counts show in es-419, then English",
		]);
	});
});
