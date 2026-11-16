import { describe, expect, it } from "vitest";

import {
	decodeMarkers,
	MarkerReader,
	markMessage,
	stripMarkers,
} from "./markers";

const RICH_KEY = "interest.taps.empty.description";
const RICH = "No taps yet. Browse the <gridLink>Grid</gridLink>.";
const OUTER_KEY = "auth.signIn.google.paste.steps.submit";
const INNER_KEY = "auth.signIn.submit";

const asTags = (text: string) =>
	String.fromCodePoint(
		...Array.from(text, (character) => 0xe0000 + character.charCodeAt(0)),
	);

const marked = (key: string, message: string) => markMessage({ key, message });

describe("markMessage", () => {
	it("opens with the key in tag characters and closes with a bare marker", () => {
		expect(marked("common.close", "Close")).toBe(
			`\u{E0001}${asTags("common.close")}\u{E007F}Close\u{E0001}\u{E007F}`,
		);
	});

	it("refuses a key that tag characters cannot spell", () => {
		for (const key of ["", "common.clöse", "common\nclose"]) {
			expect(() => marked(key, "Close")).toThrow(RangeError);
		}
	});

	it("adds nothing but markers to the text", () => {
		expect(stripMarkers(marked("common.close", "Close"))).toBe("Close");
	});
});

describe("decodeMarkers", () => {
	it("reads the key and text of a message", () => {
		expect(decodeMarkers(`(${marked("common.close", "Close")})`)).toEqual([
			{ key: "common.close", text: "Close", closed: true },
		]);
	});

	it("reads neighboring messages as separate spans", () => {
		expect(
			decodeMarkers(
				`${marked("a.first", "One")} ${marked("a.second", "Two")}`,
			),
		).toEqual([
			{ key: "a.first", text: "One", closed: true },
			{ key: "a.second", text: "Two", closed: true },
		]);
	});

	it("closes a message passed as a parameter before the message around it", () => {
		const inner = marked(INNER_KEY, "Sign in");
		const outer = marked(OUTER_KEY, `Tap “${inner}”.`);
		expect(decodeMarkers(outer)).toEqual([
			{ key: OUTER_KEY, text: "Tap “Sign in”.", closed: true },
			{ key: INNER_KEY, text: "Sign in", closed: true },
		]);
	});

	it("keeps a message open when truncation cuts off its closing marker", () => {
		const message = marked("common.close", "Close");
		for (const cut of [1, 2, 3, 4]) {
			const truncated = message.slice(0, -cut);
			expect(decodeMarkers(truncated)).toEqual([
				{ key: "common.close", text: "Close", closed: false },
			]);
			expect(stripMarkers(truncated)).toBe("Close");
		}
		expect(decodeMarkers(message.slice(0, -6))).toEqual([
			{ key: "common.close", text: "Clo", closed: false },
		]);
	});

	it("drops a truncated opening marker and a closing marker with no message", () => {
		const opening = marked("common.close", "").slice(0, 7);
		expect(decodeMarkers(`${opening}Hi\u{E0001}\u{E007F}!`)).toEqual([]);
		expect(stripMarkers(`${opening}Hi\u{E0001}\u{E007F}!`)).toBe("Hi!");
	});

	it("leaves emoji tag sequences alone", () => {
		const scotland =
			"\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
		expect(decodeMarkers(scotland)).toEqual([]);
		expect(stripMarkers(scotland)).toBe(scotland);
	});
});

describe("MarkerReader", () => {
	it("follows a rich message across the text nodes its tags split it into", () => {
		const [before = "", link = "", after = ""] = marked(
			RICH_KEY,
			RICH,
		).split(/<\/?gridLink>/);
		const reader = new MarkerReader();
		const runs = [before, link, after].map((node) => reader.read(node));
		expect(reader.spans).toEqual([
			{
				key: RICH_KEY,
				text: "No taps yet. Browse the Grid.",
				closed: true,
			},
		]);
		expect(
			runs.map((nodeRuns) => nodeRuns.map(({ text }) => text)),
		).toEqual([["No taps yet. Browse the "], ["Grid"], ["."]]);
		expect(runs[1]?.[0]?.spans).toEqual(reader.spans);
	});

	it("gives each run of text the messages open around it, outermost first", () => {
		const reader = new MarkerReader();
		const runs = reader.read(
			marked(OUTER_KEY, `Tap “${marked(INNER_KEY, "Sign in")}”.`),
		);
		expect(
			runs.map(({ text, spans }) => [text, spans.map(({ key }) => key)]),
		).toEqual([
			["Tap “", [OUTER_KEY]],
			["Sign in", [OUTER_KEY, INNER_KEY]],
			["”.", [OUTER_KEY]],
		]);
	});

	it("gives each run its offset in the text it was read from", () => {
		const reader = new MarkerReader();
		const chunk = `(${marked(OUTER_KEY, `Tap “${marked(INNER_KEY, "Sign in")}”.`)})`;
		const runs = reader.read(chunk);
		expect(runs.map(({ text }) => text)).toEqual([
			"(",
			"Tap “",
			"Sign in",
			"”.",
			")",
		]);
		for (const { text, offset } of runs) {
			expect(chunk.slice(offset, offset + text.length)).toBe(text);
		}
	});

	it("leaves the messages it unwinds unclosed and out of later text", () => {
		const reader = new MarkerReader();
		reader.read(marked("a.outer", "Outer").slice(0, -4));
		reader.read(marked("a.inner", "Inner").slice(0, -4));
		reader.unwind(({ key }) => key !== "a.inner");
		const [run] = reader.read(" tail");
		expect(run?.spans.map(({ key }) => key)).toEqual(["a.outer"]);
		reader.unwind(() => false);
		expect(reader.read("more")[0]?.spans).toEqual([]);
		expect(reader.spans).toEqual([
			{ key: "a.outer", text: "OuterInner tail", closed: false },
			{ key: "a.inner", text: "Inner", closed: false },
		]);
	});

	it("unwinds every message opened after the first one that ended", () => {
		const reader = new MarkerReader();
		reader.read(marked("a.outer", "Outer").slice(0, -4));
		reader.read(marked("a.inner", "Inner").slice(0, -4));
		reader.unwind(({ key }) => key !== "a.outer");
		expect(reader.read("rest")[0]?.spans).toEqual([]);
		expect(reader.spans.map(({ text }) => text)).toEqual([
			"OuterInner",
			"Inner",
		]);
	});

	it("keeps an unclosed message open for the text read after it", () => {
		const reader = new MarkerReader();
		reader.read(marked("a.first", "One").slice(0, -4));
		reader.read(` ${marked("a.second", "Two")}`);
		expect(reader.spans).toEqual([
			{ key: "a.first", text: "One Two", closed: false },
			{ key: "a.second", text: "Two", closed: true },
		]);
	});
});
