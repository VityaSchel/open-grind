import {
	checkNativeManifest,
	type NativeManifestCheck,
} from "./native-manifest";
import type { Message } from "./source-messages";

export type IosManifest = ReadonlyMap<string, string>;

export type IosFile = { file: string; text: string };

export type IosDrift = {
	errors: string[];
	warnings: string[];
	writes: IosFile[];
	deletes: string[];
};

export const IOS_MANIFEST = "src/lib/i18n/ios-strings.json";

export const IOS_INFO_PLIST = "src-tauri/Info.ios.plist";

export const IOS_LOCALIZATIONS = "src-tauri/gen/apple/Localizations";

const MANIFEST = "ios-strings.json";

const PLIST_KEY = /^[A-Z][A-Za-z0-9]*$/;

const STRINGS_ESCAPES = new Map([
	["\\", "\\\\"],
	['"', '\\"'],
	["\n", "\\n"],
	["\t", "\\t"],
]);

const XML_ESCAPES = new Map([
	["&", "&amp;"],
	["<", "&lt;"],
	[">", "&gt;"],
]);

const escapeStrings = (text: string) =>
	text.replace(
		/[\\"\n\t]/g,
		(character) => STRINGS_ESCAPES.get(character) ?? character,
	);

const escapeXml = (text: string) =>
	text.replace(
		/[&<>]/g,
		(character) => XML_ESCAPES.get(character) ?? character,
	);

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const plistStringsFileOf = (locale: string) =>
	`${IOS_LOCALIZATIONS}/${locale}.lproj/InfoPlist.strings`;

export function checkIosManifest({
	text,
	messages,
}: {
	text: string;
	messages: readonly Message[];
}): NativeManifestCheck {
	const check = checkNativeManifest({
		text,
		messages,
		target: {
			file: MANIFEST,
			names: "Info.plist keys",
			example:
				'"NSCameraUsageDescription": "common.camera.permissionReason"',
			shows: "an Info.plist string",
			nameProblem: (name) =>
				PLIST_KEY.test(name)
					? undefined
					: "is not an Info.plist key; use letters and digits, starting with a capital letter, such as NSCameraUsageDescription",
		},
	});
	const byKey = new Map(messages.map((message) => [message.key, message]));
	for (const [name, key] of [...check.manifest]) {
		const params = byKey.get(key)?.params ?? [];
		if (params.length === 0) continue;
		check.manifest.delete(name);
		check.errors.push(
			`${MANIFEST}: ${name}: ${key} has {{${params.join("}}, {{")}}}, which iOS cannot fill in an Info.plist string; map a message without placeholders`,
		);
	}
	return check;
}

export function renderPlistStrings({
	manifest,
	texts,
}: {
	manifest: IosManifest;
	texts: ReadonlyMap<string, string>;
}): string {
	return [...manifest]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.flatMap(([name, key]) => {
			const text = texts.get(key) ?? "";
			return text === ""
				? []
				: [`"${name}" = "${escapeStrings(text)}";\n`];
		})
		.join("");
}

export function withPlistStrings({
	plist,
	manifest,
	english,
}: {
	plist: string;
	manifest: IosManifest;
	english: ReadonlyMap<string, string>;
}): { plist: string; errors: string[] } {
	const errors: string[] = [];
	let result = plist;
	for (const [name, key] of manifest) {
		const entry = new RegExp(
			`(<key>${escapeRegExp(name)}</key>\\s*<string>)[^<]*(</string>)`,
		);
		if (!entry.test(result)) {
			errors.push(
				`${IOS_INFO_PLIST}: has no <key>${name}</key> with a <string>; add one, and gen:i18n fills it with ${key}`,
			);
			continue;
		}
		const text = escapeXml(english.get(key) ?? "");
		result = result.replace(
			entry,
			(_, start: string, end: string) => `${start}${text}${end}`,
		);
	}
	return { plist: result, errors };
}

export function iosDrift({
	translated,
	existing,
	release,
}: {
	translated: readonly IosFile[];
	existing: ReadonlyMap<string, string>;
	release: boolean;
}): IosDrift {
	const drift: IosDrift = {
		errors: [],
		warnings: [],
		writes: [],
		deletes: [],
	};
	for (const output of translated) {
		const current = existing.get(output.file);
		if (current === output.text) continue;
		drift.writes.push(output);
		if (current === undefined) {
			drift.errors.push(`${output.file} is missing.`);
		} else if (release) {
			drift.errors.push(`${output.file} is out of date.`);
		} else {
			drift.warnings.push(
				`${output.file}: is out of date, so iOS shows older text; run \`bun run gen:i18n\` and commit the result before a release`,
			);
		}
	}
	const owned = new Set(translated.map(({ file }) => file));
	for (const file of [...existing.keys()].sort()) {
		if (owned.has(file)) continue;
		drift.deletes.push(file);
		drift.errors.push(
			`${file} is for a language that shipped.json doesn’t list.`,
		);
	}
	return drift;
}
