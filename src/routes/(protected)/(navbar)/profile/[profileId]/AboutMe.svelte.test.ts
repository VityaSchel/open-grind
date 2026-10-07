// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { untranslatableTexts } from "$lib/test/untranslatable";
import AboutMe from "./AboutMe.svelte";

afterEach(cleanup);

describe("AboutMe", () => {
	it("keeps the profile's own words out of page translation", () => {
		const children = createRawSnippet(() => ({
			render: () => "<span>Into hiking, ask me anything</span>",
		}));

		const { container } = render(AboutMe, { props: { children } });

		expect(untranslatableTexts(container)).toEqual([
			"Into hiking, ask me anything",
		]);
	});
});
