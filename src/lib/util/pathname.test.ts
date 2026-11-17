import { describe, expect, it } from "vitest";

import { entryPathname, isWithin } from "#lib/util/pathname.ts";

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

describe("entryPathname", () => {
	it("reads an address with no path as the root", () => {
		expect(entryPathname("tauri://localhost")).toBe("/");
	});

	it("keeps the path of an address that has one", () => {
		expect(entryPathname("tauri://localhost/profile/7?tab=albums")).toBe(
			"/profile/7",
		);
	});
});
