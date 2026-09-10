// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import BackButton from "./BackButton.svelte";

const { afterNavigateCallbacks } = vi.hoisted(() => ({
	afterNavigateCallbacks: [] as (() => void)[],
}));

vi.mock("$app/navigation", () => ({
	afterNavigate: (callback: () => void) =>
		afterNavigateCallbacks.push(callback),
}));

function renderBackLink({
	canGoBack,
	historyLength = 1,
}: {
	canGoBack?: boolean;
	historyLength?: number;
}) {
	const back = vi.fn();
	vi.stubGlobal(
		"navigation",
		canGoBack === undefined ? undefined : { canGoBack },
	);
	vi.stubGlobal("history", { length: historyLength, back });
	return {
		back,
		link: render(BackButton).getByRole("link", { name: "Back" }),
	};
}

function clickFollowsLink(
	link: HTMLElement,
	{ metaKey = false } = {},
): boolean {
	let followsLink = false;
	const listening = new AbortController();
	document.addEventListener(
		"click",
		(event) => {
			followsLink = !event.defaultPrevented;
			event.preventDefault();
		},
		{ signal: listening.signal },
	);
	link.dispatchEvent(
		new MouseEvent("click", { bubbles: true, cancelable: true, metaKey }),
	);
	listening.abort();
	return followsLink;
}

function completeNavigation() {
	for (const onNavigated of afterNavigateCallbacks) onNavigated();
}

describe("BackButton", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		afterNavigateCallbacks.length = 0;
	});

	it("goes back through history when there is a previous screen", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		expect(clickFollowsLink(link)).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("opens Browse when the profile is the first screen", () => {
		const { back, link } = renderBackLink({
			canGoBack: false,
			historyLength: 5,
		});

		expect(link.getAttribute("href")).toBe("/");
		expect(clickFollowsLink(link)).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("opens Browse on a lone entry where the Navigation API is missing", () => {
		const { back, link } = renderBackLink({ historyLength: 1 });

		expect(clickFollowsLink(link)).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("goes back on a longer history where the Navigation API is missing", () => {
		const { back, link } = renderBackLink({ historyLength: 2 });

		expect(clickFollowsLink(link)).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("pops once for a double tap before the navigation lands", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		clickFollowsLink(link);

		expect(clickFollowsLink(link)).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("pops again once the previous navigation has landed", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		clickFollowsLink(link);
		completeNavigation();

		expect(clickFollowsLink(link)).toBe(false);
		expect(back).toHaveBeenCalledTimes(2);
	});

	it("leaves a modified click to the browser", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		expect(clickFollowsLink(link, { metaKey: true })).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});
});
