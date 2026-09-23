import { describe, expect, it } from "vitest";

import { ancestorsOf, stackRelation } from "./hierarchy";

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
