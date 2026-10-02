import { describe, expect, it } from "vitest";

import { ancestorsOf, pushedFromChain, stackRelation } from "./hierarchy";

describe("stackRelation", () => {
	it("reads direction from the path hierarchy", () => {
		expect(stackRelation({ from: "/settings", to: "/settings/app" })).toBe(
			"push",
		);
		expect(stackRelation({ from: "/settings/app", to: "/settings" })).toBe(
			"pop",
		);
		expect(
			stackRelation({
				from: "/settings/app",
				to: "/settings/app/credits",
			}),
		).toBe("push");
		expect(
			stackRelation({ from: "/settings/app/credits", to: "/settings" }),
		).toBe("pop");
	});

	it("has no direction between siblings or a page and itself", () => {
		expect(
			stackRelation({ from: "/settings/app", to: "/settings/profile" }),
		).toBeNull();
		expect(
			stackRelation({ from: "/settings", to: "/settings" }),
		).toBeNull();
		expect(stackRelation({ from: "/settings", to: "/chat" })).toBeNull();
	});

	it("does not treat a shared prefix as a parent", () => {
		expect(
			stackRelation({ from: "/settings", to: "/settings-extra" }),
		).toBeNull();
		expect(ancestorsOf([{ path: "/settings" }], "/settings-extra")).toEqual(
			[],
		);
	});
});

describe("ancestorsOf", () => {
	it("keeps only the entries the path sits beneath", () => {
		const entries = [
			{ path: "/settings" },
			{ path: "/settings/app" },
			{ path: "/settings/profile" },
		];
		expect(ancestorsOf(entries, "/settings/app/credits")).toEqual([
			{ path: "/settings" },
			{ path: "/settings/app" },
		]);
	});

	it("drops an entry once the path has returned to it", () => {
		expect(ancestorsOf([{ path: "/settings" }], "/settings")).toEqual([]);
	});
});

describe("pushedFromChain", () => {
	it("walks back through history while each entry is a parent of the one after it", () => {
		expect(
			pushedFromChain({
				pathname: "/settings/account/blocked",
				earlier: ["/settings/account", "/settings", "/browse"],
			}),
		).toEqual([{ path: "/settings" }, { path: "/settings/account" }]);
	});

	it("stops at the first entry the page was not pushed from", () => {
		expect(
			pushedFromChain({
				pathname: "/settings/profile",
				earlier: ["/profile/1", "/settings"],
			}),
		).toEqual([]);
		expect(
			pushedFromChain({
				pathname: "/settings/account/blocked",
				earlier: ["/settings/account", null, "/settings"],
			}),
		).toEqual([{ path: "/settings/account" }]);
	});

	it("is empty for a page opened directly", () => {
		expect(
			pushedFromChain({ pathname: "/settings/app", earlier: [] }),
		).toEqual([]);
	});
});
