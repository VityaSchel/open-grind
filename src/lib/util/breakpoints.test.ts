import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { breakpoints } from "$lib/util/breakpoints.svelte";

function parseBreakpointTokens(css: string) {
	const tokens: Record<string, string> = {};
	for (const [, name, value] of css.matchAll(
		/--breakpoint-([\w-]+):\s*([^;]+);/g,
	)) {
		if (name && value) tokens[name] = value.trim();
	}
	return tokens;
}

describe("breakpoints", () => {
	it("matches the --breakpoint-* tokens in CSS", () => {
		const tokens = {
			...parseBreakpointTokens(
				readFileSync("node_modules/tailwindcss/theme.css", "utf8"),
			),
			...parseBreakpointTokens(readFileSync("src/layout.css", "utf8")),
		};

		for (const [name, value] of Object.entries(breakpoints)) {
			expect(tokens[name], `--breakpoint-${name}`).toBe(value);
		}
	});
});
