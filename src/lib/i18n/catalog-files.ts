import { everyLanguageOffered } from "./offered";
import { shippedFiles } from "./shipped-files";

export type CatalogJson = string | { readonly [key: string]: CatalogJson };

export type CatalogLoaders = Readonly<
	Record<string, () => Promise<CatalogJson>>
>;

export const sourceFiles = import.meta.glob<CatalogJson>(
	"./locales/en/*.json",
	{ eager: true, import: "default" },
);

export const translationFiles: CatalogLoaders = everyLanguageOffered
	? import.meta.glob<CatalogJson>(
			["./locales/*/*.json", "!./locales/en/*.json"],
			{ import: "default" },
		)
	: shippedFiles;
