import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
	HISTORY_METADATA_KEY,
	liveHistoryIndex,
} from "#lib/util/history-index.ts";

const KIT_CLIENT = "node_modules/@sveltejs/kit/src/runtime/client";

afterEach(() => {
	history.replaceState(null, "", "/");
});

describe("HISTORY_METADATA_KEY", () => {
	it("is where the installed SvelteKit numbers each history entry", () => {
		const constants = readFileSync(`${KIT_CLIENT}/constants.js`, "utf8");
		const client = readFileSync(`${KIT_CLIENT}/client.js`, "utf8");

		expect(constants).toContain(
			`export const HISTORY_METADATA_KEY = '${HISTORY_METADATA_KEY}';`,
		);
		expect(client).toContain("return state?.[HISTORY_METADATA_KEY];");
		expect(client).toMatch(/historyIndex: \(current_history_index \+= /);
	});
});

describe("liveHistoryIndex", () => {
	it("reads the index SvelteKit gave the current entry", () => {
		history.replaceState(
			{ [HISTORY_METADATA_KEY]: { historyIndex: 1_762_200_000_004 } },
			"",
		);

		expect(liveHistoryIndex()).toBe(1_762_200_000_004);
	});

	it("is unknown for an entry SvelteKit has not numbered", () => {
		history.replaceState(null, "");
		expect(liveHistoryIndex()).toBeUndefined();

		history.replaceState({ [HISTORY_METADATA_KEY]: {} }, "");
		expect(liveHistoryIndex()).toBeUndefined();

		history.replaceState(
			{ [HISTORY_METADATA_KEY]: { historyIndex: "4" } },
			"",
		);
		expect(liveHistoryIndex()).toBeUndefined();
	});
});
