import { describe, expect, it } from "vitest";

import {
	renderLocalesConfig,
	withBundleLocalizations,
} from "./native-languages";

const HEADER = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
	'<plist version="1.0">',
];

const plistOf = (body: string[]) =>
	[...HEADER, "<dict>", ...body, "</dict>", "</plist>", ""].join("\n");

const camera = [
	"\t<key>NSCameraUsageDescription</key>",
	"\t<string>Take photos</string>",
];

const localizations = (...ids: string[]) => [
	"\t<key>CFBundleLocalizations</key>",
	"\t<array>",
	...ids.map((id) => `\t\t<string>${id}</string>`),
	"\t</array>",
];

describe("renderLocalesConfig", () => {
	it("lists American English while nothing else ships", () => {
		expect(renderLocalesConfig([])).toBe(
			[
				'<?xml version="1.0" encoding="utf-8"?>',
				'<locale-config xmlns:android="http://schemas.android.com/apk/res/android">',
				'\t<locale android:name="en-US" />',
				"</locale-config>",
				"",
			].join("\n"),
		);
	});

	it("lists the picker tag of each shipped catalog", () => {
		const names = [
			...renderLocalesConfig(["pt-BR", "es", "zh-Hant", "de"]).matchAll(
				/android:name="([^"]+)"/g,
			),
		].map(([, name]) => name);
		expect(names).toEqual(["de", "en-US", "es-ES", "pt-BR", "zh-Hant"]);
	});
});

describe("withBundleLocalizations", () => {
	it("creates the plist when there is none", () => {
		expect(withBundleLocalizations({ plist: "", shipped: [] })).toBe(
			plistOf(localizations("en")),
		);
	});

	it("adds the key to a plist that lacks it and keeps the other keys", () => {
		expect(
			withBundleLocalizations({
				plist: plistOf(camera),
				shipped: ["es-419", "de"],
			}),
		).toBe(plistOf([...camera, ...localizations("de", "en", "es-419")]));
	});

	it("replaces the localizations in place", () => {
		const plist = plistOf([...localizations("en", "fr"), ...camera]);
		expect(withBundleLocalizations({ plist, shipped: ["de"] })).toBe(
			plistOf([...localizations("de", "en"), ...camera]),
		);
	});

	it("replaces an empty array", () => {
		const plist = plistOf([
			...camera,
			"\t<key>CFBundleLocalizations</key>",
			"\t<array/>",
		]);
		expect(withBundleLocalizations({ plist, shipped: [] })).toBe(
			plistOf([...camera, ...localizations("en")]),
		);
	});

	it("is stable when applied to its own output", () => {
		const once = withBundleLocalizations({
			plist: plistOf(camera),
			shipped: ["de"],
		});
		expect(
			withBundleLocalizations({ plist: once ?? "", shipped: ["de"] }),
		).toBe(once);
	});

	it.each([
		["an empty root dictionary", [...HEADER, "<dict/>", "</plist>"]],
		["a root array", [...HEADER, "<array>", "</array>", "</plist>"]],
	])("refuses %s", (_name, lines) => {
		expect(
			withBundleLocalizations({ plist: lines.join("\n"), shipped: [] }),
		).toBeUndefined();
	});
});
