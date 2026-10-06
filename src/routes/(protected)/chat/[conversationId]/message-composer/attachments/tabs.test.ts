import { describe, expect, it } from "vitest";

import { t } from "$lib/i18n";
import { selectionActionKeys } from "./tabs";

describe("selectionActionKeys", () => {
	it.each([
		["send", "Send"],
		["share", "Share"],
		["unshare", "Unshare"],
	] as const)("labels the %s action", (action, label) => {
		expect(t(selectionActionKeys[action])).toBe(label);
	});
});
