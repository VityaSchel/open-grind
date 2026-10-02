// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { SexualPosition, sexualPositions } from "$lib/model/users/profiles";
import SexualPositionLabel from "./SexualPosition.svelte";

afterEach(cleanup);

describe("SexualPosition", () => {
	it("names every position and draws each with an icon of its own", () => {
		const drawings = Object.values(SexualPosition).map((sexualPosition) => {
			const { container } = render(SexualPositionLabel, {
				props: { sexualPosition },
			});

			expect(container.textContent.trim()).toBe(
				sexualPositions[sexualPosition],
			);
			const drawing = container.querySelector("svg")?.innerHTML;
			cleanup();
			return drawing;
		});

		expect(drawings).not.toContain(undefined);
		expect(new Set(drawings).size).toBe(drawings.length);
	});

	it("renders nothing for a position it does not know", () => {
		const { container } = render(SexualPositionLabel, {
			props: { sexualPosition: 99 },
		});

		expect(container.textContent).toBe("");
		expect(container.querySelector("svg")).toBeNull();
	});
});
