import { describe, expect, it } from "vitest";

import {
	checkDesktopManifest,
	DESKTOP_STRINGS,
	desktopDrift,
	type DesktopStrings,
	matchingData,
	renderDesktopTexts,
	renderJson,
	renderMatcherCases,
} from "./desktop-strings";
import { sourceFile } from "./locale-files";
import { catalogTexts, collectMessages } from "./source-messages";

const textsOf = (json: unknown) => catalogTexts([sourceFile(json)]);

const messagesOf = (json: unknown) =>
	collectMessages([sourceFile(json)]).messages;

const SOURCE = {
	signIn: { title: "Sign In with Google" },
	location: { description: "Run from {{folder}}." },
	photos_one: "{{count}} photo",
	photos_other: "{{count}} photos",
	rules: "Read the <rulesLink>rules</rulesLink>.",
};

describe("checkDesktopManifest", () => {
	const check = (manifest: unknown) =>
		checkDesktopManifest({
			text: JSON.stringify(manifest),
			messages: messagesOf(SOURCE),
		});

	it("maps each name to its message", () => {
		expect(
			check({
				google_sign_in_title: "ns.signIn.title",
				location_description: "ns.location.description",
			}),
		).toEqual({
			manifest: new Map([
				["google_sign_in_title", "ns.signIn.title"],
				["location_description", "ns.location.description"],
			]),
			errors: [],
		});
	});

	it("rejects names Rust cannot match, unknown keys, plurals and tags", () => {
		expect(
			check({
				"Sign-In": "ns.signIn.title",
				missing: "ns.nothing",
				photos: "ns.photos",
				rules: "ns.rules",
				number: 3,
			}).errors,
		).toEqual([
			"desktop-strings.json: Sign-In: is not a desktop string name; use lowercase letters, digits and _, starting with a letter, such as google_sign_in_title",
			"desktop-strings.json: missing: ns.nothing is not a message in locales/en; fix the key or add the message",
			"desktop-strings.json: photos: ns.photos is a plural group, which is not supported until a native plural exists; map a message without {{count}}",
			"desktop-strings.json: rules: ns.rules has <rulesLink>, which desktop text cannot show; map a message without tags",
			'desktop-strings.json: number: 3 is not a message key such as "chat.notification.you"',
		]);
	});

	it("rejects a manifest that is not an object of names", () => {
		expect(check(["ns.signIn.title"]).errors).toEqual([
			'desktop-strings.json: must hold an object of desktop string names and message keys, such as {"google_sign_in_title": "auth.signIn.google.title"}',
		]);
	});
});

describe("matchingData", () => {
	it("gives a likely script to every language that can reach a catalog", () => {
		expect(matchingData(["en"]).likelyScripts).toEqual({ en: "Latn" });
		expect(matchingData(["nb", "sr"]).likelyScripts).toEqual({
			nb: "Latn",
			nn: "Latn",
			no: "Latn",
			sr: "Cyrl",
		});
	});

	it("carries the matcher's tables whatever ships", () => {
		const { aliases, likelySubtags, parents } = matchingData(["en"]);
		expect(aliases).toMatchObject({ tl: "fil" });
		expect(likelySubtags).toMatchObject({ pt: "pt-Latn-BR" });
		expect(parents).toMatchObject({ "es-MX": "es-419", nn: "no" });
		expect(matchingData(["de", "pt-BR"]).parents).toEqual(parents);
	});
});

describe("renderDesktopTexts", () => {
	const manifest = new Map([
		["location_description", "ns.location.description"],
		["google_sign_in_title", "ns.signIn.title"],
	]);
	const english = textsOf(SOURCE);

	it("writes each mapped message by name in name order", () => {
		const rendered = renderDesktopTexts({
			manifest,
			texts: english,
			english,
		});
		expect(rendered).toEqual({
			texts: {
				google_sign_in_title: "Sign In with Google",
				location_description: "Run from {{folder}}.",
			},
			errors: [],
		});
		expect(Object.keys(rendered.texts)).toEqual([
			"google_sign_in_title",
			"location_description",
		]);
	});

	it("leaves out what a translation lacks and tidies its placeholders", () => {
		expect(
			renderDesktopTexts({
				manifest,
				texts: textsOf({
					signIn: { title: "" },
					location: { description: "Aus {{ folder }} starten." },
				}),
				english,
			}),
		).toEqual({
			texts: { location_description: "Aus {{folder}} starten." },
			errors: [],
		});
	});

	it("refuses a lone surrogate, which Rust cannot read from JSON", () => {
		expect(
			renderDesktopTexts({
				manifest,
				texts: textsOf({ signIn: { title: "Broken \uD800" } }),
				english,
			}).errors,
		).toEqual([
			"ns.signIn.title: has a lone surrogate \\uD800, which the desktop app cannot read; retype the character",
		]);
	});
});

describe("desktopDrift", () => {
	const current: DesktopStrings = {
		matching: matchingData(["de", "en"]),
		catalogs: {
			de: { location_quit: "Beenden" },
			en: { location_quit: "Quit" },
		},
	};
	const drift = ({
		existing,
		release = false,
	}: {
		existing: DesktopStrings | string | undefined;
		release?: boolean;
	}) =>
		desktopDrift({
			rendered: current,
			existing:
				typeof existing === "object" ? renderJson(existing) : existing,
			release,
		});
	const write = renderJson(current);
	const outOfDate = `${DESKTOP_STRINGS} is out of date.`;

	it("reports nothing when the file is current", () => {
		expect(drift({ existing: current })).toEqual({
			errors: [],
			warnings: [],
			write: undefined,
		});
	});

	it("fails on a missing file", () => {
		expect(drift({ existing: undefined })).toEqual({
			errors: [`${DESKTOP_STRINGS} is missing.`],
			warnings: [],
			write,
		});
	});

	it("fails on out-of-date English or matcher data", () => {
		const english = {
			...current,
			catalogs: { ...current.catalogs, en: { location_quit: "Exit" } },
		};
		const matching = { ...current, matching: matchingData(["en"]) };
		for (const existing of [english, matching, "not json"]) {
			expect(drift({ existing })).toEqual({
				errors: [outOfDate],
				warnings: [],
				write,
			});
		}
	});

	it("only warns about an out-of-date translation outside a release", () => {
		const existing = {
			...current,
			catalogs: { ...current.catalogs, de: { location_quit: "Alt" } },
		};
		expect(drift({ existing })).toEqual({
			errors: [],
			warnings: [
				`${DESKTOP_STRINGS}: de is out of date, so the desktop app shows older text; run \`bun run gen:i18n\` and commit the result before a release`,
			],
			write,
		});
		expect(drift({ existing, release: true })).toEqual({
			errors: [`${DESKTOP_STRINGS}: de is out of date.`],
			warnings: [],
			write,
		});
	});

	it("fails on a missing shipped language and on one that is not shipped", () => {
		expect(
			drift({
				existing: {
					...current,
					catalogs: {
						en: current.catalogs.en ?? {},
						fr: { location_quit: "Quitter" },
					},
				},
			}).errors,
		).toEqual([
			`${DESKTOP_STRINGS}: de is missing.`,
			`${DESKTOP_STRINGS}: fr is for a language that shipped.json doesn’t list.`,
		]);
	});

	it("fails on a file that only differs in its formatting", () => {
		expect(drift({ existing: JSON.stringify(current) })).toEqual({
			errors: [outOfDate],
			warnings: [],
			write,
		});
	});
});

describe("renderMatcherCases", () => {
	it("records the catalogs the app's matcher picks for the Rust port", () => {
		const { cases } = JSON.parse(renderMatcherCases()) as {
			cases: [string, string | null][];
		};
		const picked = new Map(cases);
		expect(picked.get("es-MX")).toBe("es-419");
		expect(picked.get("zh-TW")).toBe("zh-Hant");
		expect(picked.get("nn")).toBe("nb");
		expect(picked.get("en-IN")).toBe("en-GB");
		expect(picked.get("sr_RS@latin")).toBeNull();
		expect(picked.get("C")).toBeNull();
	});
});
