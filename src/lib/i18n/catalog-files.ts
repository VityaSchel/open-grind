export type CatalogJson = string | { readonly [key: string]: CatalogJson };

export const sourceFiles = import.meta.glob<CatalogJson>(
	"./locales/en/*.json",
	{ eager: true, import: "default" },
);

export const translationFiles = import.meta.glob<CatalogJson>(
	["./locales/*/*.json", "!./locales/en/*.json"],
	{ import: "default" },
);
