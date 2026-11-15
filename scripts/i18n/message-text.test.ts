import { describe, expect, it } from "vitest";

import { inspect } from "./message-text";

describe("inspect", () => {
	it("reads placeholders, tags and the placeholders tags wrap in one pass", () => {
		expect(
			inspect(
				"{{name}} shared <b>{{count}} photos</b> in <albumLink>the {{album}} album</albumLink>",
			),
		).toEqual({
			params: ["name", "count", "album"],
			tags: ["b", "albumLink"],
			wrapped: ["count", "album"],
			problems: [],
		});
	});

	it.each([
		"Open <params>the settings</params>",
		"Sent by {{params}}",
		"<b>{{count}}</b> new",
	])("accepts the name in %j", (text) => {
		expect(inspect(text).problems).toEqual([]);
	});

	it.each([
		[
			"<key>x</key>",
			"<key> is reserved for a Rich.svelte prop; pick another name",
		],
		[
			"<children>x</children>",
			"<children> is reserved for a Rich.svelte prop; pick another name",
		],
		[
			"<count>x</count>",
			"<count> is reserved for the plural {{count}}; pick another name",
		],
		[
			"Hi {{key}}",
			"{{key}} is reserved for a Rich.svelte prop; pick another name",
		],
		[
			"Hi {{children}}",
			"{{children}} is reserved for a Rich.svelte prop; pick another name",
		],
	])("rejects the reserved name in %j", (text, problem) => {
		expect(inspect(text)).toMatchObject({
			params: [],
			problems: [problem],
		});
	});

	it.each([
		"<b>by {{name}}</b>",
		"<albumLink>{{album}} album</albumLink>",
		"<b>写真</b>を見る",
	])("accepts the tag in %j as wrapping text", (text) => {
		expect(inspect(text).problems).toEqual([]);
	});

	it.each([
		["Rated <b>4.5</b>", "b"],
		["Rated <b> </b>", "b"],
		["<b>{{album}}!</b>", "b"],
		["Open the <menuIcon></menuIcon> menu, {{name}}", "menuIcon"],
	])("rejects the tag in %j as wrapping no text", (text, tag) => {
		expect(inspect(text).problems).toEqual([
			`<${tag}> wraps no text; use a {{placeholder}} for what the app supplies`,
		]);
	});

	it("keeps reading placeholders after a broken tag", () => {
		expect(inspect("<b>x</i> {{name}} <i>{{count}}</i>")).toEqual({
			params: ["name", "count"],
			tags: [],
			wrapped: [],
			problems: ["</i> does not match the open <b>"],
		});
	});

	it.each([
		["<ссылка>Закрыть</ссылка>", "<ссылка>"],
		["<1>Закрыть</1>", "<1>"],
		["<_b>Закрыть</_b>", "<_b>"],
	])("rejects the tag name in %j", (text, token) => {
		expect(inspect(text).problems).toEqual([
			`${token} is not a valid tag; write <camelCaseName> or </camelCaseName> with no attributes`,
		]);
	});
});
