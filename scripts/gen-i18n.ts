import { globSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import path from "node:path";

import { SOURCE_LOCALE } from "../src/lib/i18n/syntax";
import {
	ANDROID_MANIFEST,
	ANDROID_RES,
	androidDrift,
	checkAndroidManifest,
	declaredStrings,
	ENGLISH_STRINGS,
	renderAndroidStrings,
	stringsFileOf,
} from "./i18n/android-strings";
import { LOCALES, readLocaleFiles, SHIPPED } from "./i18n/locale-files";
import {
	INFO_PLIST,
	LOCALES_CONFIG,
	renderLocalesConfig,
	withBundleLocalizations,
} from "./i18n/native-languages";
import { renderTypes } from "./i18n/render-types";
import { checkShipped, renderShippedFiles } from "./i18n/shipped";
import {
	catalogTexts,
	checkTranslation,
	collectMessages,
} from "./i18n/source-messages";

const ROOT = path.join(import.meta.dir, "..");

const check = process.argv.includes("--check");

const release = process.argv.includes("--release");

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
	release,
});

for (const warning of shipped.warnings) console.warn(`warning: ${warning}`);

const readText = (file: string) =>
	Bun.file(path.join(ROOT, file))
		.text()
		.catch(() => "");

const readFiles = (pattern: string) =>
	Promise.all(
		globSync(pattern, { cwd: path.join(ROOT, ANDROID_RES) })
			.sort()
			.map(async (relative) => {
				const file = `${ANDROID_RES}/${relative}`;
				return { file, text: await readText(file) };
			}),
	);

const infoPlist = withBundleLocalizations({
	plist: await readText(INFO_PLIST),
	shipped: shipped.languages,
});

const android = checkAndroidManifest({
	text: await readText(ANDROID_MANIFEST),
	messages,
	declared: declaredStrings(
		(await readFiles("values/*.xml")).filter(
			({ file }) => file !== ENGLISH_STRINGS,
		),
	),
});

const english = catalogTexts(source);

const renderStrings = ({
	locale,
	file,
	texts,
}: {
	locale: string;
	file: string;
	texts: ReadonlyMap<string, string>;
}) => ({
	locale,
	file,
	...renderAndroidStrings({ manifest: android.manifest, texts, english }),
});

const englishStrings = renderStrings({
	locale: SOURCE_LOCALE,
	file: ENGLISH_STRINGS,
	texts: english,
});

const translatedStrings = shipped.languages.map((locale) =>
	renderStrings({
		locale,
		file: stringsFileOf(locale),
		texts: catalogTexts(catalogs.get(locale) ?? []),
	}),
);

const problems = [
	...errors,
	...reports.flatMap((report) => report.errors),
	...shipped.errors,
	...android.errors,
	...[englishStrings, ...translatedStrings].flatMap((rendered) =>
		rendered.errors.map((error) => `${rendered.locale}/${error}`),
	),
];

if (infoPlist === undefined) {
	problems.push(
		`${INFO_PLIST}: has no top-level <dict> to hold CFBundleLocalizations`,
	);
}

if (problems.length > 0 || infoPlist === undefined) {
	console.error(problems.map((problem) => `error: ${problem}`).join("\n"));
	process.exit(1);
}

const outputs = [
	{ file: "src/lib/i18n/generated.ts", text: renderTypes(messages) },
	{
		file: "src/lib/i18n/shipped-files.ts",
		text: renderShippedFiles(shipped.languages),
	},
	{ file: LOCALES_CONFIG, text: renderLocalesConfig(shipped.languages) },
	{ file: INFO_PLIST, text: infoPlist },
];

const changed: typeof outputs = [];

for (const output of outputs) {
	if ((await readText(output.file)) !== output.text) changed.push(output);
}

const drift = androidDrift({
	english: englishStrings,
	translated: translatedStrings,
	existing: new Map(
		(await readFiles("values*/strings.xml")).map(({ file, text }) => [
			file,
			text,
		]),
	),
	release,
});

if (
	changed.length === 0 &&
	drift.writes.length === 0 &&
	drift.deletes.length === 0
) {
	console.log(`i18n files up to date (${messages.length} messages)`);
} else if (check) {
	for (const warning of drift.warnings) console.warn(`warning: ${warning}`);
	const stale = [
		...changed.map(({ file }) => `${file} is out of date.`),
		...drift.errors,
	];
	if (stale.length > 0) {
		console.error(stale.join("\n"));
		console.error("Run `bun run gen:i18n` and commit the result.");
		process.exit(1);
	}
} else {
	for (const { file, text } of [...changed, ...drift.writes]) {
		await Bun.write(path.join(ROOT, file), text);
		console.log(`wrote ${file}`);
	}
	for (const file of drift.deletes) {
		const folder = path.dirname(path.join(ROOT, file));
		rmSync(path.join(ROOT, file));
		if (readdirSync(folder).length === 0) rmdirSync(folder);
		console.log(`deleted ${file}`);
	}
}
