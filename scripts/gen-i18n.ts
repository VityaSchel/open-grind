import path from "node:path";

import { SOURCE_LOCALE } from "../src/lib/i18n/syntax";
import { LOCALES, readLocaleFiles, SHIPPED } from "./i18n/locale-files";
import { renderTypes } from "./i18n/render-types";
import { checkShipped, renderShippedFiles } from "./i18n/shipped";
import { checkTranslation, collectMessages } from "./i18n/source-messages";

const ROOT = path.join(import.meta.dir, "..");

const catalogs = readLocaleFiles(LOCALES);
const source = catalogs.get(SOURCE_LOCALE) ?? [];
const offered = [...catalogs.keys()];
const { messages, errors } = collectMessages(source);
const reports = [...catalogs]
	.filter(([locale]) => locale !== SOURCE_LOCALE)
	.map(([locale, files]) => ({
		locale,
		...checkTranslation({ locale, files, source, offered }),
	}));

for (const { locale, warnings, translated, total } of reports) {
	for (const warning of warnings) console.warn(`warning: ${warning}`);
	console.log(`${locale}: ${translated}/${total} messages translated`);
}

const shipped = checkShipped({
	text: await Bun.file(SHIPPED).text(),
	completion: new Map(
		reports.map(({ locale, translated, total }) => [
			locale,
			{ translated, total },
		]),
	),
	release: process.argv.includes("--release"),
});

for (const warning of shipped.warnings) console.warn(`warning: ${warning}`);

const problems = [
	...errors,
	...reports.flatMap((report) => report.errors),
	...shipped.errors,
];

if (problems.length > 0) {
	console.error(problems.map((problem) => `error: ${problem}`).join("\n"));
	process.exit(1);
}

const outputs = [
	{ file: "src/lib/i18n/generated.ts", text: renderTypes(messages) },
	{
		file: "src/lib/i18n/shipped-files.ts",
		text: renderShippedFiles(shipped.languages),
	},
];

const changed: typeof outputs = [];

for (const output of outputs) {
	const current = await Bun.file(path.join(ROOT, output.file))
		.text()
		.catch(() => "");
	if (current !== output.text) changed.push(output);
}

if (changed.length === 0) {
	console.log(`i18n files up to date (${messages.length} messages)`);
} else if (process.argv.includes("--check")) {
	for (const { file } of changed) console.error(`${file} is out of date.`);
	console.error("Run `bun run gen:i18n` and commit the result.");
	process.exit(1);
} else {
	for (const { file, text } of changed) {
		await Bun.write(path.join(ROOT, file), text);
		console.log(`wrote ${file} (${messages.length} messages)`);
	}
}
