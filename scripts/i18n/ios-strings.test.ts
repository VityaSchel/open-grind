import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SOURCE_LOCALE } from "../../src/lib/i18n/syntax";
import {
	checkIosManifest,
	IOS_INFO_PLIST,
	IOS_MANIFEST,
	iosDrift,
	plistStringsFileOf,
	renderPlistStrings,
	withPlistStrings,
} from "./ios-strings";
import { LOCALES, readLocaleFiles, sourceFile } from "./locale-files";
import { catalogTexts, collectMessages } from "./source-messages";

const ROOT = path.join(import.meta.dirname, "../..");

const LOCATION = "NSLocationWhenInUseUsageDescription";

const PLIST = [
	"<dict>",
	`\t<key>${LOCATION}</key>`,
	"\t<string>Old reason</string>",
	"</dict>",
	"",
].join("\n");

describe("checkIosManifest", () => {
	const { messages } = collectMessages([
		sourceFile({
			reason: "We use your location",
			named: "{{name}} uses your location",
		}),
	]);
	const check = (manifest: unknown) =>
		checkIosManifest({ text: JSON.stringify(manifest), messages });

	it("returns the entries of a valid manifest", () => {
		const { manifest, errors } = check({ [LOCATION]: "ns.reason" });

		expect(errors).toEqual([]);
		expect([...manifest]).toEqual([[LOCATION, "ns.reason"]]);
	});

	it("rejects a name that is not an Info.plist key", () => {
		const { manifest, errors } = check({ location_reason: "ns.reason" });

		expect(manifest.size).toBe(0);
		expect(errors).toEqual([
			"ios-strings.json: location_reason: is not an Info.plist key; use letters and digits, starting with a capital letter, such as NSCameraUsageDescription",
		]);
	});

	it("rejects a message with placeholders, which an Info.plist string cannot fill", () => {
		const { manifest, errors } = check({ [LOCATION]: "ns.named" });

		expect(manifest.size).toBe(0);
		expect(errors).toEqual([
			`ios-strings.json: ${LOCATION}: ns.named has {{name}}, which iOS cannot fill in an Info.plist string; map a message without placeholders`,
		]);
	});

	it("accepts the shipped manifest against the English catalog", () => {
		const source = readLocaleFiles(LOCALES).get(SOURCE_LOCALE) ?? [];
		const { errors, manifest } = checkIosManifest({
			text: readFileSync(path.join(ROOT, IOS_MANIFEST), "utf8"),
			messages: collectMessages(source).messages,
		});

		expect(errors).toEqual([]);
		expect(manifest.size).toBeGreaterThan(0);
	});
});

describe("renderPlistStrings", () => {
	const manifest = new Map([
		[LOCATION, "reason"],
		["NSCameraUsageDescription", "camera"],
	]);

	it("sorts by key and escapes quotes, backslashes, line breaks and tabs", () => {
		expect(
			renderPlistStrings({
				manifest,
				texts: new Map([
					["reason", 'Nutzt „deinen“ "Ort"\\\nund\tmehr'],
					["camera", "Kamera"],
				]),
			}),
		).toBe(
			`"NSCameraUsageDescription" = "Kamera";\n"${LOCATION}" = "Nutzt „deinen“ \\"Ort\\"\\\\\\nund\\tmehr";\n`,
		);
	});

	it("leaves an untranslated key to Info.plist", () => {
		expect(
			renderPlistStrings({
				manifest,
				texts: new Map([["reason", "Nutzt deinen Ort"]]),
			}),
		).toBe(`"${LOCATION}" = "Nutzt deinen Ort";\n`);
	});

	it("writes nothing when no key is translated", () => {
		expect(renderPlistStrings({ manifest, texts: new Map() })).toBe("");
	});
});

describe("withPlistStrings", () => {
	const manifest = new Map([[LOCATION, "ns.reason"]]);

	it("puts the English message in the Info.plist string, escaped for XML", () => {
		const { plist, errors } = withPlistStrings({
			plist: PLIST,
			manifest,
			english: catalogTexts([
				sourceFile({ reason: "Maps & chats <here>" }),
			]),
		});

		expect(errors).toEqual([]);
		expect(plist).toBe(
			PLIST.replace("Old reason", "Maps &amp; chats &lt;here&gt;"),
		);
	});

	it("reports a key the Info.plist lacks instead of inventing one", () => {
		const { plist, errors } = withPlistStrings({
			plist: "<dict>\n</dict>\n",
			manifest,
			english: new Map([["ns.reason", "Reason"]]),
		});

		expect(plist).toBe("<dict>\n</dict>\n");
		expect(errors).toEqual([
			`${IOS_INFO_PLIST}: has no <key>${LOCATION}</key> with a <string>; add one, and gen:i18n fills it with ns.reason`,
		]);
	});
});

describe("iosDrift", () => {
	const german = { file: plistStringsFileOf("de"), text: '"A" = "B";\n' };

	it("names the file of each shipped language after its tag", () => {
		expect(plistStringsFileOf("es-419")).toBe(
			"src-tauri/gen/apple/Localizations/es-419.lproj/InfoPlist.strings",
		);
	});

	it("writes a missing file and fails on it", () => {
		const drift = iosDrift({
			translated: [german],
			existing: new Map(),
			release: false,
		});

		expect(drift.writes).toEqual([german]);
		expect(drift.errors).toEqual([`${german.file} is missing.`]);
	});

	it("only warns about a stale translation until a release", () => {
		const existing = new Map([[german.file, '"A" = "Old";\n']]);

		const everyday = iosDrift({
			translated: [german],
			existing,
			release: false,
		});
		const release = iosDrift({
			translated: [german],
			existing,
			release: true,
		});

		expect(everyday.errors).toEqual([]);
		expect(everyday.warnings).toHaveLength(1);
		expect(release.errors).toEqual([`${german.file} is out of date.`]);
	});

	it("deletes the file of a language that no longer ships", () => {
		const french = plistStringsFileOf("fr");
		const drift = iosDrift({
			translated: [german],
			existing: new Map([
				[german.file, german.text],
				[french, '"A" = "C";\n'],
			]),
			release: false,
		});

		expect(drift.writes).toEqual([]);
		expect(drift.deletes).toEqual([french]);
		expect(drift.errors).toEqual([
			`${french} is for a language that shipped.json doesn’t list.`,
		]);
	});
});
