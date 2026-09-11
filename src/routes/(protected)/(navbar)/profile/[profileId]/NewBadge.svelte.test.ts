// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import NewBadge from "./NewBadge.svelte";

describe("NewBadge", () => {
	it("marks a profile the server reports as new", () => {
		const { container } = render(NewBadge, { props: { isNew: true } });

		const badge = container.querySelector('[data-slot="new-badge"]');

		expect(badge?.textContent?.trim()).toBe("New");
		expect(badge?.getAttribute("title")).toBe("Joined recently");
	});

	it("renders nothing for a profile that is not new", () => {
		const { container } = render(NewBadge, { props: { isNew: false } });

		expect(container.textContent).toBe("");
	});
});
