import { afterEach, describe, expect, it } from "vitest";

import {
	HISTORY_METADATA_KEY,
	liveHistoryIndex,
} from "#lib/util/history-index.ts";

afterEach(() => {
	history.replaceState(null, "", "/");
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
