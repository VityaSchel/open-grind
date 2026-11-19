import { describe, expect, it } from "vitest";

import type { SupportedPlatform } from "#lib/platform/os.ts";
import { capturesScreen, hidesNavBar } from "./screen-swipe-routes";

const PROFILE = "/(protected)/(navbar)/profile/[profileId]";
const EDIT_PROFILE = "/(protected)/(navbar)/settings/(subpage)/profile";
const DISPLAY = "/(protected)/(navbar)/settings/(subpage)/app/display";
const SETTINGS_ROOT = "/(protected)/(navbar)/settings/(me)";
const GRID = "/(protected)/(navbar)/(root)";
const CONVERSATION = "/(protected)/chat/[conversationId]";
const RIGHT_NOW = "/(protected)/(navbar)/right-now";

const capturing: SupportedPlatform[] = ["ios", "android"];
const desktop: SupportedPlatform[] = ["macos", "linux", "windows"];

describe("capturesScreen", () => {
	it.each(capturing)(
		"captures the screen a profile is opened from on %s",
		(platform) => {
			for (const fromPath of [
				"/",
				"/chat/1-2",
				"/settings",
				"/profile/7",
			])
				expect(
					capturesScreen({ fromPath, toRoute: PROFILE, platform }),
					fromPath,
				).toBe(true);
		},
	);

	it.each(capturing)(
		"captures the screen a settings page is entered from outside Settings on %s",
		(platform) => {
			expect(
				capturesScreen({
					fromPath: "/profile/7",
					toRoute: EDIT_PROFILE,
					platform,
				}),
			).toBe(true);
			expect(
				capturesScreen({
					fromPath: "/chat/1-2",
					toRoute: DISPLAY,
					platform,
				}),
			).toBe(true);
		},
	);

	it.each(capturing)(
		"leaves settings pages pushed inside Settings to the page stack on %s",
		(platform) => {
			for (const fromPath of ["/settings", "/settings/app"])
				expect(
					capturesScreen({ fromPath, toRoute: DISPLAY, platform }),
					fromPath,
				).toBe(false);
		},
	);

	it.each(capturing)(
		"captures nothing for tab roots and other screens on %s",
		(platform) => {
			for (const toRoute of [SETTINGS_ROOT, GRID, RIGHT_NOW, null])
				expect(
					capturesScreen({
						fromPath: "/profile/7",
						toRoute,
						platform,
					}),
					String(toRoute),
				).toBe(false);
		},
	);

	it.each(capturing)(
		"captures the screen a conversation is opened from outside the inbox on %s",
		(platform) => {
			for (const fromPath of [
				"/profile/7",
				"/right-now",
				"/",
				"/settings/app",
				"/chat/1-2",
			])
				expect(
					capturesScreen({
						fromPath,
						toRoute: CONVERSATION,
						platform,
					}),
					fromPath,
				).toBe(true);
		},
	);

	it.each(capturing)(
		"leaves a conversation opened from the inbox to the inbox's own swipe on %s",
		(platform) => {
			expect(
				capturesScreen({
					fromPath: "/chat",
					toRoute: CONVERSATION,
					platform,
				}),
			).toBe(false);
		},
	);

	it.each(desktop)("captures nothing on %s", (platform) => {
		expect(
			capturesScreen({ fromPath: "/", toRoute: PROFILE, platform }),
		).toBe(false);
		expect(
			capturesScreen({
				fromPath: "/profile/7",
				toRoute: EDIT_PROFILE,
				platform,
			}),
		).toBe(false);
		expect(
			capturesScreen({
				fromPath: "/profile/7",
				toRoute: CONVERSATION,
				platform,
			}),
		).toBe(false);
	});
});

describe("hidesNavBar", () => {
	it("hides the NavBar only in a conversation", () => {
		expect(hidesNavBar(CONVERSATION)).toBe(true);
		for (const toRoute of [PROFILE, EDIT_PROFILE, GRID, RIGHT_NOW, null])
			expect(hidesNavBar(toRoute), String(toRoute)).toBe(false);
	});
});
