import { describe, expect, it } from "vitest";

import { routeForDeeplink } from "./deeplink";

describe("routing a Grindr push deeplink", () => {
	it("opens the conversation the notification names", () => {
		expect(
			routeForDeeplink(
				"grindr://conversation?id=852120758%3A858049792&senderId=852120758",
			),
		).toBe("/chat/852120758%3A858049792");
	});

	it("opens the taps tab", () => {
		expect(routeForDeeplink("grindr://taps-inbox")).toBe("/interest/taps");
	});

	it("ignores a conversation deeplink with no conversation", () => {
		expect(routeForDeeplink("grindr://conversation")).toBeNull();
		expect(routeForDeeplink("grindr://conversation?senderId=1")).toBeNull();
		expect(routeForDeeplink("grindr://conversation?id=")).toBeNull();
	});

	it("refuses every deeplink Open Grind has no screen for", () => {
		for (const deeplink of [
			"grindr://fresh-albums?albumIds=1",
			"grindr://store",
			"grindr://clear?profileIds=1",
			"https://evil.example/chat/1",
			"javascript:alert(1)",
			"",
		]) {
			expect(routeForDeeplink(deeplink)).toBeNull();
		}
	});

	it("never lets a deeplink escape the chat route", () => {
		expect(
			routeForDeeplink("grindr://conversation?id=..%2F..%2Fadmin"),
		).toBe("/chat/..%2F..%2Fadmin");
		expect(routeForDeeplink("grindr://conversation?id=a/b")).toBe(
			"/chat/a%2Fb",
		);
	});
});
