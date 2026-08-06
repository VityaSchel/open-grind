// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import UserAvatar from "./UserAvatar.svelte";

const BROKEN = '[data-slot="broken-media"]';

describe("UserAvatar", () => {
	afterEach(cleanup);

	it("shows the no-photo branch, not the broken fallback, for a null hash", () => {
		const { container } = render(UserAvatar, {
			props: { mediaHash: null },
		});

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("swaps a failing photo for the broken fallback", async () => {
		const { container } = render(UserAvatar, {
			props: { mediaHash: "deadbeef" },
		});

		const img = container.querySelector("img");
		expect(img?.src).toContain("deadbeef");

		await fireEvent.error(img!);

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).not.toBeNull();
	});
});
