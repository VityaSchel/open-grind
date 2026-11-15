import { describe, expect, it } from "vitest";

import type { Uncapturable } from "./tally";
import uncapturableJson from "./uncapturable.json";

const UNCAPTURABLE: Uncapturable = uncapturableJson;
const SENTENCE_CHARACTERS = /^[A-Za-z0-9 .,;:!?()/+%{}\-‘’“”…–—]+$/u;
const DOTTED_NAME = /[A-Za-z0-9]\.[A-Za-z0-9]/;
const SENTENCE_BREAK = /[.!?…][”’]?\s+\p{Lu}/u;
const BANNED_WORDS = /\b(?:we|us|our|please)\b/i;

describe("uncapturable.json", () => {
	it.each(Object.entries(UNCAPTURABLE))(
		"gives %s a reason and a translator explanation",
		(_pattern, entry) => {
			expect(Object.keys(entry).sort()).toEqual([
				"explanation",
				"reason",
			]);
			expect(entry.reason.length).toBeGreaterThan(0);
			const { explanation } = entry;
			expect(explanation.length).toBeGreaterThanOrEqual(10);
			expect(explanation.length).toBeLessThanOrEqual(300);
			expect(explanation).toMatch(/^[A-Z]/);
			expect(explanation).toMatch(/\.$/);
			expect(explanation).toMatch(SENTENCE_CHARACTERS);
			expect(explanation).not.toContain("://");
			expect(explanation).not.toMatch(DOTTED_NAME);
			expect(explanation.slice(0, -1)).not.toMatch(SENTENCE_BREAK);
			expect(explanation).not.toMatch(BANNED_WORDS);
		},
	);
});
