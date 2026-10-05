import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseLocalePath } from "../../src/lib/i18n/syntax";
import type { SourceFile } from "./source-messages";

const I18N = path.join(import.meta.dirname, "../../src/lib/i18n");

export const LOCALES = path.join(I18N, "locales");

export const FIXTURES = path.join(I18N, "fixtures");

export function readLocaleFiles(directory: string): Map<string, SourceFile[]> {
	const files = globSync("*/*.json", { cwd: directory })
		.sort()
		.map((relative) => ({
			...parseLocalePath(relative),
			text: readFileSync(path.join(directory, relative), "utf8"),
		}));
	return Map.groupBy(files, ({ locale }) => locale);
}
