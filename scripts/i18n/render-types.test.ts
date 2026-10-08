import { describe, expect, it } from "vitest";

import { sourceFile } from "./locale-files";
import { renderTypes } from "./render-types";
import { collectMessages, type SourceFile } from "./source-messages";

describe("renderTypes", () => {
	const json = {
		alphabet: "Alphabet {{name}}",
		alphaZulu: "Alpha Zulu",
		bravo: "<link>Bravo</link> {{first}} {{second}}",
		terms: "Read <b>the {{app}} terms</b>",
		photos_one: "One photo",
		photos_other: "<b>{{count}}</b> photos",
		videos_one: "One video",
		videos_other: "{{count}} videos",
	};

	it("prints one member per line in code point order", () => {
		expect(renderTypes(collectMessages([sourceFile(json)]).messages)).toBe(
			[
				"export interface Messages {",
				'\t"ns.alphaZulu": undefined;',
				'\t"ns.alphabet": { name: string };',
				'\t"ns.videos": { count: number };',
				"}",
				"",
				"export interface RichMessages {",
				'\t"ns.alphabet": { name: "placeholder" };',
				'\t"ns.bravo": { first: "placeholder"; link: "tag"; second: "placeholder" };',
				'\t"ns.photos": { b: "tag"; count: "count" };',
				'\t"ns.terms": { app: "text"; b: "tag" };',
				"}",
				"",
			].join("\n"),
		);
	});

	it("ignores file and key order", () => {
		const reversed = Object.fromEntries(Object.entries(json).reverse());
		const render = (files: SourceFile[]) =>
			renderTypes(collectMessages(files).messages);
		const other = { namespace: "aa", text: '{ "x": "X" }' };
		expect(render([other, sourceFile(reversed)])).toBe(
			render([sourceFile(json), other]),
		);
	});

	it("prints empty interfaces without messages", () => {
		expect(renderTypes([])).toBe(
			[
				"export interface Messages {}",
				"",
				"export interface RichMessages {}",
				"",
			].join("\n"),
		);
	});
});
