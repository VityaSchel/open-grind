// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({ onNavigate: vi.fn() }));
vi.mock("#lib/platform/system-back-gesture.ts", () => ({
	attachSystemBackGesture: () => () => {},
}));

import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { PageStackState } from "./page-stack-state.svelte";
import PageStack from "./PageStack.svelte";

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("PageStack", () => {
	it("forgets its copies of earlier pages when the language changes", async () => {
		const forget = vi.spyOn(PageStackState.prototype, "forgetSnapshots");
		render(PageStack, {
			props: {
				scope: "/settings",
				children: createRawSnippet(() => ({
					render: () => "<div></div>",
				})),
			},
		});
		forget.mockClear();

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() => expect(forget).toHaveBeenCalled());
	});
});
