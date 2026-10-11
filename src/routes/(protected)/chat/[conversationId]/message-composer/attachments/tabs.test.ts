import { describe, expect, it } from "vitest";

import { t } from "$lib/i18n";
import { selectionActionKeys, tabLabelKeys } from "./tabs";

describe("selectionActionKeys", () => {
	it.each([
		["send", "Send"],
		["share", "Share"],
		["unshare", "Unshare"],
	] as const)("labels the %s action", (action, label) => {
		expect(t(selectionActionKeys[action])).toBe(label);
	});
});

describe("tabLabelKeys", () => {
	it.each([
		["media", "Media"],
		["albums", "Albums"],
		["location", "Location"],
	] as const)("names the %s tab", (tab, label) => {
		expect(t(tabLabelKeys[tab])).toBe(label);
	});
});
