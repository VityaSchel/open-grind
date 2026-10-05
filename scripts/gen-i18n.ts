import path from "node:path";

import { SOURCE_LOCALE } from "../src/lib/i18n/syntax";
import { readLocaleFiles } from "./i18n/locale-files";
import { renderTypes } from "./i18n/render-types";
import { checkTranslation, collectMessages } from "./i18n/source-messages";

const LOCALES = path.join(import.meta.dir, "../src/lib/i18n/locales");
const OUTPUT = path.join(import.meta.dir, "../src/lib/i18n/generated.ts");

const catalogs = readLocaleFiles(LOCALES);
const source = catalogs.get(SOURCE_LOCALE) ?? [];
const { messages, errors } = collectMessages(source);
const reports = [...catalogs]
	.filter(([locale]) => locale !== SOURCE_LOCALE)
	.map(([locale, files]) => ({
		locale,
		...checkTranslation({ locale, files, source }),
	}));

for (const { locale, warnings, translated, total } of reports) {
	for (const warning of warnings) console.warn(`warning: ${warning}`);
	console.log(`${locale}: ${translated}/${total} messages translated`);
}

const problems = [...errors, ...reports.flatMap((report) => report.errors)];

if (problems.length > 0) {
	console.error(problems.map((problem) => `error: ${problem}`).join("\n"));
	process.exit(1);
}

const output = renderTypes(messages);
const relative = path.relative(process.cwd(), OUTPUT);
const current = await Bun.file(OUTPUT)
	.text()
	.catch(() => "");

if (current === output) {
	console.log(`i18n types up to date (${messages.length} messages)`);
} else if (process.argv.includes("--check")) {
	console.error(
		`${relative} is out of date. Run \`bun run gen:i18n\` and commit the result.`,
	);
	process.exit(1);
} else {
	await Bun.write(OUTPUT, output);
	console.log(`wrote ${relative} (${messages.length} messages)`);
}
