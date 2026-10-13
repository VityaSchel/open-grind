import { describe, expect, it } from "vitest";

import { type Completion, checkShipped, renderShippedFiles } from "./shipped";

const complete = { translated: 1021, total: 1021 };

const completion = new Map<string, Completion>([
	["ar", complete],
	["de", complete],
	["es-419", { translated: 1020, total: 1021 }],
	["he", complete],
	["pt-BR", complete],
	["ur", complete],
]);

const check = ({
	shipped,
	release = false,
}: {
	shipped: unknown;
	release?: boolean;
}) => checkShipped({ text: JSON.stringify(shipped), completion, release });

describe("checkShipped", () => {
	it("ships nothing beyond English when the list is empty", () => {
		expect(check({ shipped: [] })).toEqual({
			languages: [],
			errors: [],
			warnings: [],
		});
	});

	it("ships complete languages in sorted order", () => {
		expect(check({ shipped: ["pt-BR", "de"], release: true })).toEqual({
			languages: ["de", "pt-BR"],
			errors: [],
			warnings: [],
		});
	});

	it("warns about an incomplete language in everyday runs", () => {
		const message =
			"shipped.json: es-419: has 1020 of 1021 messages translated, and a release ships only complete languages";
		expect(check({ shipped: ["es-419"] })).toEqual({
			languages: ["es-419"],
			errors: [],
			warnings: [message],
		});
		expect(check({ shipped: ["es-419"], release: true })).toEqual({
			languages: ["es-419"],
			errors: [message],
			warnings: [],
		});
	});

	it.each<{ name: string; shipped: unknown; error: string }>([
		{
			name: "English",
			shipped: ["en"],
			error: "shipped.json: en: English always ships, so remove it",
		},
		{
			name: "a duplicate",
			shipped: ["de", "de"],
			error: "shipped.json: de: is listed twice",
		},
		{
			name: "an unknown directory",
			shipped: ["fr"],
			error: "shipped.json: fr: has no locales/fr directory",
		},
		{
			name: "a pseudo-locale",
			shipped: ["en-XA"],
			error: "shipped.json: en-XA: has no locales/en-XA directory",
		},
		{
			name: "a non-string entry",
			shipped: [{ id: "de" }],
			error: 'shipped.json: {"id":"de"} is not a language directory such as "de"',
		},
		...["ar", "he", "ur"].map((rightToLeft) => ({
			name: `right-to-left ${rightToLeft}`,
			shipped: [rightToLeft],
			error: `shipped.json: ${rightToLeft}: is written right to left, which the app cannot lay out yet, so remove it`,
		})),
	])("refuses $name", ({ shipped, error }) => {
		const { errors, warnings } = check({ shipped });
		expect(errors).toEqual([error]);
		expect(warnings).toEqual([]);
	});

	it("keeps the valid entries next to refused ones", () => {
		const { languages, errors } = check({ shipped: ["de", "ar", "de"] });
		expect(languages).toEqual(["de"]);
		expect(errors).toHaveLength(2);
	});

	it.each([
		["an object", { de: true }],
		["a string", "de"],
		["null", null],
	])("refuses %s instead of an array", (_name, shipped) => {
		expect(check({ shipped }).errors).toEqual([
			'shipped.json: must hold an array of language directories, such as ["de", "pt-BR"]',
		]);
	});

	it("refuses text that is not JSON", () => {
		const { errors } = checkShipped({
			text: '["de",',
			completion,
			release: false,
		});
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/^shipped\.json: is not valid JSON: /);
	});
});

describe("renderShippedFiles", () => {
	it("bundles no catalog while nothing ships", () => {
		expect(renderShippedFiles([])).toBe(
			"export const shippedFiles = {};\n",
		);
	});

	it("globs each shipped directory in sorted order", () => {
		expect(renderShippedFiles(["pt-BR", "de"])).toBe(
			[
				'import type { CatalogJson } from "./catalog-files";',
				"",
				"export const shippedFiles = import.meta.glob<CatalogJson>(",
				"\t[",
				'\t\t"./locales/de/*.json",',
				'\t\t"./locales/pt-BR/*.json",',
				"\t],",
				'\t{ import: "default" },',
				");",
				"",
			].join("\n"),
		);
	});
});
