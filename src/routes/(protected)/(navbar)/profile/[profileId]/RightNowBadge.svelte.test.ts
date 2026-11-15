// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import RightNowBadge from "./RightNowBadge.svelte";

describe("RightNowBadge", () => {
	it.each([
		["HOSTING", "Hosting"],
		["NOT_HOSTING", "Right Now"],
	] as const)("says a %s profile is %s", (status, text) => {
		const { container } = render(RightNowBadge, { props: { status } });

		const badge = container.querySelector(
			'[data-slot="profile-right-now-badge"]',
		);
		expect(badge?.textContent.trim()).toBe(text);
		expect(badge?.querySelector("svg")).not.toBeNull();
	});

	it("renders nothing for a profile not on Right Now", () => {
		const { container } = render(RightNowBadge, {
			props: { status: "NOT_ACTIVE" },
		});

		expect(container.textContent).toBe("");
	});
});
