// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { TapType } from "$lib/model/interest/taps";
import TapIcon from "./TapIcon.svelte";

afterEach(cleanup);

describe("TapIcon", () => {
	it.each([
		[TapType.Friendly, "Cookie tap"],
		[TapType.Hot, "Fire tap"],
		[TapType.Looking, "Demon tap"],
	])("names tap type %i in its alt text", (tapType, alt) => {
		const { getByRole } = render(TapIcon, { props: { tapType } });

		expect(getByRole("img").getAttribute("alt")).toBe(alt);
	});
});
