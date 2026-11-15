import { describe, expect, it } from "vitest";

import { settingsTrail } from "./subpage-routes";

describe("settingsTrail", () => {
	it("passes the Security screen above the discreet app icon, where its row is", () => {
		expect(settingsTrail("/settings/app/discreet-icon")).toEqual([
			"/settings",
			"/settings/app",
			"/settings/app/security",
			"/settings/app/discreet-icon",
		]);
	});

	it("follows each subpage's Back link up to the settings tab", () => {
		expect(settingsTrail("/settings/account/privacy")).toEqual([
			"/settings",
			"/settings/account",
			"/settings/account/privacy",
		]);
	});
});
