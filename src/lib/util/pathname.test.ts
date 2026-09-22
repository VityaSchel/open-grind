import { describe, expect, it } from "vitest";

import { isWithin } from "$lib/util/pathname";

describe("isWithin", () => {
	it("includes the root itself", () => {
		expect(isWithin({ pathname: "/settings", root: "/settings" })).toBe(
			true,
		);
	});

	it("includes paths nested under the root", () => {
		expect(
			isWithin({ pathname: "/settings/app/theme", root: "/settings" }),
		).toBe(true);
	});

	it("excludes siblings that only share a prefix", () => {
		expect(isWithin({ pathname: "/settingsx", root: "/settings" })).toBe(
			false,
		);
	});

	it("excludes the parent of the root", () => {
		expect(isWithin({ pathname: "/", root: "/settings" })).toBe(false);
	});

	it("accepts a root that ends with a slash", () => {
		expect(isWithin({ pathname: "/chat/1:2", root: "/chat/" })).toBe(true);
		expect(isWithin({ pathname: "/chat/", root: "/chat/" })).toBe(true);
		expect(isWithin({ pathname: "/chats", root: "/chat/" })).toBe(false);
	});

	it("treats the site root as containing every path", () => {
		expect(isWithin({ pathname: "/", root: "/" })).toBe(true);
		expect(isWithin({ pathname: "/chat", root: "/" })).toBe(true);
	});
});
