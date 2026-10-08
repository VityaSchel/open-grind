import { vi } from "vitest";

import type { CatalogJson } from "../catalog-files";

const actual =
	await vi.importActual<typeof import("../catalog-files")>(
		"../catalog-files",
	);

const fixtureSources = import.meta.glob<CatalogJson>("./en/*.json", {
	eager: true,
	import: "default",
});

const fixtureTranslations = import.meta.glob<CatalogJson>(
	["./*/*.json", "!./en/*.json"],
	{ import: "default" },
);

const inline = (json: CatalogJson) => () => Promise.resolve(json);

export const sourceFiles = { ...actual.sourceFiles, ...fixtureSources };

export const translationFiles = {
	...fixtureTranslations,
	"./locales/de/common.json": inline({
		actions: { close: "Schließen" },
		time: {
			minutes_zero: "Keine Minuten",
			minutes_one: "{{count}} Min.",
			minutes_other: "{{ count }} Min.",
		},
	}),
	"./locales/de/feedback.json": inline({
		requestBlocked: {
			cloudflare: {
				knownIssue: "Das ist ein <link>bekanntes Problem</link>.",
			},
		},
	}),
	"./locales/eo/feedback.json": inline({
		requestBlocked: {
			cloudflare: {
				knownIssue:
					"<valueOf>Tio</valueOf> estas <link>konata</link> <constructor>problemo</constructor>{{toString}}.",
			},
		},
	}),
	"./locales/eo/sample.json": inline({
		chat: {
			shared_one: "<b>{{name}}</b> dividis {{count}} foton en {{album}}",
			shared_other:
				"<b>{{name}}</b> dividis {{count}} fotojn en {{album}}",
		},
	}),
	"./locales/ur/common.json": inline({}),
	"./locales/ur-Aran/common.json": inline({}),
	"./locales/ur-Arab/common.json": inline({}),
};
