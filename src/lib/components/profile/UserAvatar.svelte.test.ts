// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runningOn } from "$lib/test/platform";
import { profileMediaUrl } from "$lib/util/media";
import UserAvatar from "./UserAvatar.svelte";

const BROKEN = '[data-slot="broken-media"]';

beforeEach(() => {
	runningOn("windows");
});

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
		expect(img?.src).toBe(
			profileMediaUrl({ mediaHash: "deadbeef", size: "thumb" }),
		);

		await fireEvent.error(img!);

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).not.toBeNull();
	});
});
