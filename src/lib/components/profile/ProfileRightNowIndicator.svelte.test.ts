// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProfileRightNowIndicator from "./ProfileRightNowIndicator.svelte";

afterEach(cleanup);

describe("ProfileRightNowIndicator", () => {
	it("shows nothing while the profile is not on Right Now", () => {
		const { container } = render(ProfileRightNowIndicator, {
			status: "NOT_ACTIVE",
		});

		expect(container.querySelector("[data-slot]")).toBeNull();
	});

	it.each([
		["HOSTING", "Right Now · Hosting"],
		["NOT_HOSTING", "Right Now"],
	] as const)(
		"names a %s status for pointer and screen reader users",
		(status, title) => {
			const { container } = render(ProfileRightNowIndicator, { status });

			const indicator = container.querySelector(
				'[data-slot="right-now-indicator"]',
			);
			expect(indicator?.getAttribute("title")).toBe(title);
			expect(
				screen
					.getByText(title)
					.closest('[data-slot="right-now-indicator"]'),
			).toBe(indicator);
			expect(indicator?.querySelector("svg")).not.toBeNull();
		},
	);
});
