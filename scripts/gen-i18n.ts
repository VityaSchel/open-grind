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
import {
	checkDesktopManifest,
	DESKTOP_MANIFEST,
	DESKTOP_STRINGS,
	desktopDrift,
	MATCHER_CASES,
	matchingData,
	renderDesktopTexts,
	renderMatcherCases,
} from "./i18n/desktop-strings";
import {
	checkIosManifest,
	IOS_INFO_PLIST,
	IOS_LOCALIZATIONS,
	IOS_MANIFEST,
	iosDrift,
	plistStringsFileOf,
	renderPlistStrings,
	withPlistStrings,
} from "./i18n/ios-strings";
import { LOCALES, readLocaleFiles, SHIPPED } from "./i18n/locale-files";
import {
	GRADLE_PROPERTIES,
	INFO_PLIST,
	LOCALES_CONFIG,
	renderLocalesConfig,
	withBundleLocalizations,
	withLocaleFilters,
} from "./i18n/native-languages";
import {
	ALLOWED_PLURAL_PLACEHOLDERS,
	checkPluralPlaceholders,
} from "./i18n/plural-placeholders";
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

const desktop = checkDesktopManifest({
	text: await readText(DESKTOP_MANIFEST),
	messages,
});

const ios = checkIosManifest({ text: await readText(IOS_MANIFEST), messages });

const english = catalogTexts(source);

const iosPlistStrings = withPlistStrings({
	plist: await readText(IOS_INFO_PLIST),
	manifest: ios.manifest,
	english,
});

const iosInfoPlist = withBundleLocalizations({
	plist: iosPlistStrings.plist,
	shipped: shipped.languages,
});

const iosStrings = shipped.languages.map((locale) => ({
	file: plistStringsFileOf(locale),
	text: renderPlistStrings({
		manifest: ios.manifest,
		texts: catalogTexts(catalogs.get(locale) ?? []),
	}),
}));

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

const desktopTexts = [SOURCE_LOCALE, ...shipped.languages].map((locale) => ({
	locale,
	...renderDesktopTexts({
		manifest: desktop.manifest,
		texts:
			locale === SOURCE_LOCALE
				? english
				: catalogTexts(catalogs.get(locale) ?? []),
		english,
	}),
}));

const problems = [
	...errors,
	...checkPluralPlaceholders({
		texts: english,
		allowed: ALLOWED_PLURAL_PLACEHOLDERS,
	}),
	...reports.flatMap((report) => report.errors),
	...shipped.errors,
	...android.errors,
	...desktop.errors,
	...ios.errors,
	...iosPlistStrings.errors,
	...[englishStrings, ...translatedStrings, ...desktopTexts].flatMap(
		(rendered) =>
			rendered.errors.map((error) => `${rendered.locale}/${error}`),
	),
];

if (infoPlist === undefined) {
	problems.push(
		`${INFO_PLIST}: has no top-level <dict> to hold CFBundleLocalizations`,
	);
}

if (iosInfoPlist === undefined) {
	problems.push(
		`${IOS_INFO_PLIST}: has no top-level <dict> to hold CFBundleLocalizations`,
	);
}

if (
	problems.length > 0 ||
	infoPlist === undefined ||
	iosInfoPlist === undefined
) {
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
	{ file: IOS_INFO_PLIST, text: iosInfoPlist },
	{
		file: GRADLE_PROPERTIES,
		text: withLocaleFilters({
			properties: await readText(GRADLE_PROPERTIES),
			shipped: shipped.languages,
		}),
	},
	{ file: MATCHER_CASES, text: renderMatcherCases() },
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

const existingDesktop = await readText(DESKTOP_STRINGS);

const iosFiles = iosDrift({
	translated: iosStrings,
	existing: new Map(
		await Promise.all(
			globSync("*.lproj/InfoPlist.strings", {
				cwd: path.join(ROOT, IOS_LOCALIZATIONS),
			})
				.sort()
				.map(async (relative) => {
					const file = `${IOS_LOCALIZATIONS}/${relative}`;
					return [file, await readText(file)] as const;
				}),
		),
	),
	release,
});

const desktopStrings = desktopDrift({
	rendered: {
		matching: matchingData([SOURCE_LOCALE, ...shipped.languages]),
		catalogs: Object.fromEntries(
			desktopTexts.map(({ locale, texts }) => [locale, texts]),
		),
	},
	existing: existingDesktop === "" ? undefined : existingDesktop,
	release,
});

if (
	changed.length === 0 &&
	drift.writes.length === 0 &&
	drift.deletes.length === 0 &&
	iosFiles.writes.length === 0 &&
	iosFiles.deletes.length === 0 &&
	desktopStrings.write === undefined
) {
	console.log(`i18n files up to date (${messages.length} messages)`);
} else if (check) {
	for (const warning of [
		...drift.warnings,
		...iosFiles.warnings,
		...desktopStrings.warnings,
	]) {
		console.warn(`warning: ${warning}`);
	}
	const stale = [
		...changed.map(({ file }) => `${file} is out of date.`),
		...drift.errors,
		...iosFiles.errors,
		...desktopStrings.errors,
	];
	if (stale.length > 0) {
		console.error(stale.join("\n"));
		console.error("Run `bun run gen:i18n` and commit the result.");
		process.exit(1);
	}
} else {
	const desktopWrites =
		desktopStrings.write === undefined
			? []
			: [{ file: DESKTOP_STRINGS, text: desktopStrings.write }];
	for (const { file, text } of [
		...changed,
		...drift.writes,
		...iosFiles.writes,
		...desktopWrites,
	]) {
		await Bun.write(path.join(ROOT, file), text);
		console.log(`wrote ${file}`);
	}
	for (const file of [...drift.deletes, ...iosFiles.deletes]) {
		const folder = path.dirname(path.join(ROOT, file));
		rmSync(path.join(ROOT, file));
		if (readdirSync(folder).length === 0) rmdirSync(folder);
		console.log(`deleted ${file}`);
	}
}
