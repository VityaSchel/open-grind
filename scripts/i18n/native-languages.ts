import { pickerTag } from "../../src/lib/i18n/matcher";
import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";

export const LOCALES_CONFIG =
	"src-tauri/gen/android/app/src/main/res/xml/locales_config.xml";

export const INFO_PLIST = "src-tauri/Info.plist";

const EMPTY_PLIST = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
	'<plist version="1.0">',
	"<dict>",
	"</dict>",
	"</plist>",
	"",
].join("\n");

const BUNDLE_LOCALIZATIONS =
	/^([ \t]*)<key>CFBundleLocalizations<\/key>\s*(?:<array\/>|<array>[\s\S]*?<\/array>)[ \t]*\n/m;

const ROOT_DICT_END = /<\/dict>\s*<\/plist>\s*$/;

function catalogs(shipped: readonly string[]): string[] {
	return [SOURCE_LOCALE, ...shipped].sort();
}

export function renderLocalesConfig(shipped: readonly string[]): string {
	const locales = catalogs(shipped)
		.map((catalog) => `\t<locale android:name="${pickerTag(catalog)}" />\n`)
		.join("");
	return [
		'<?xml version="1.0" encoding="utf-8"?>\n',
		'<locale-config xmlns:android="http://schemas.android.com/apk/res/android">\n',
		locales,
		"</locale-config>\n",
	].join("");
}

function localizationsEntry({
	indent,
	shipped,
}: {
	indent: string;
	shipped: readonly string[];
}): string {
	const strings = catalogs(shipped)
		.map((catalog) => `${indent}\t<string>${catalog}</string>\n`)
		.join("");
	return `${indent}<key>CFBundleLocalizations</key>\n${indent}<array>\n${strings}${indent}</array>\n`;
}

export function withBundleLocalizations({
	plist,
	shipped,
}: {
	plist: string;
	shipped: readonly string[];
}): string | undefined {
	const source = plist === "" ? EMPTY_PLIST : plist;
	const existing = BUNDLE_LOCALIZATIONS.exec(source);
	if (existing !== null) {
		const [whole, indent = ""] = existing;
		return (
			source.slice(0, existing.index) +
			localizationsEntry({ indent, shipped }) +
			source.slice(existing.index + whole.length)
		);
	}
	const end = ROOT_DICT_END.exec(source)?.index;
	if (end === undefined) return undefined;
	return (
		source.slice(0, end) +
		localizationsEntry({ indent: "\t", shipped }) +
		source.slice(end)
	);
}
