// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import BackButton from "./BackButton.svelte";

const { afterNavigateCallbacks, gotoMock } = vi.hoisted(() => ({
	afterNavigateCallbacks: [] as (() => void)[],
	gotoMock: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
	afterNavigate: (callback: () => void) =>
		afterNavigateCallbacks.push(callback),
	goto: gotoMock,
}));

function renderBackLink({
	canGoBack,
	historyLength = 1,
}: {
	canGoBack?: boolean;
	historyLength?: number;
}) {
	const back = vi.fn();
	const index = canGoBack ? 1 : 0;
	vi.stubGlobal(
		"navigation",
		canGoBack === undefined
			? undefined
			: {
					canGoBack,
					currentEntry: { index },
					entries: () =>
						Array.from({ length: index + 1 }, () => ({
							url: location.href,
						})),
				},
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

function pressEscape({
	on = window,
	repeat = false,
}: { on?: EventTarget; repeat?: boolean } = {}) {
	on.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Escape",
			code: "Escape",
			bubbles: true,
			cancelable: true,
			repeat,
		}),
	);
}

function completeNavigation() {
	for (const onNavigated of afterNavigateCallbacks) onNavigated();
}

describe("BackButton", () => {
	afterEach(() => {
		cleanup();
		document.body.replaceChildren();
		vi.unstubAllGlobals();
		afterNavigateCallbacks.length = 0;
		gotoMock.mockReset();
	});

	it("goes back through history when there is a previous screen", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		expect(clickFollowsLink(link)).toBe(false);
		expect(back).toHaveBeenCalledOnce();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("replaces the profile with Browse when it is the first screen", () => {
		const { back, link } = renderBackLink({
			canGoBack: false,
			historyLength: 5,
		});

		expect(link.getAttribute("href")).toBe("/");
		expect(clickFollowsLink(link)).toBe(false);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/", {
			replaceState: true,
		});
		expect(back).not.toHaveBeenCalled();
	});

	it("replaces a lone entry with Browse where the Navigation API is missing", () => {
		const { back, link } = renderBackLink({ historyLength: 1 });

		expect(clickFollowsLink(link)).toBe(false);
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/", {
			replaceState: true,
		});
		expect(back).not.toHaveBeenCalled();
	});

	it("replaces once for a double tap on the first screen", () => {
		const { link } = renderBackLink({ canGoBack: false });

		clickFollowsLink(link);

		expect(clickFollowsLink(link)).toBe(false);
		expect(gotoMock).toHaveBeenCalledOnce();
	});

	it("replaces the first screen with Browse on Escape", () => {
		const { back } = renderBackLink({ canGoBack: false });

		pressEscape();

		expect(gotoMock).toHaveBeenCalledExactlyOnceWith("/", {
			replaceState: true,
		});
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

	it("goes back on Escape", () => {
		const { back } = renderBackLink({ canGoBack: true });

		pressEscape();

		expect(back).toHaveBeenCalledOnce();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it("pops once for Escape pressed twice before the navigation lands", () => {
		const { back } = renderBackLink({ canGoBack: true });

		pressEscape();
		pressEscape();

		expect(back).toHaveBeenCalledOnce();
	});

	it("ignores Escape held down", () => {
		const { back } = renderBackLink({ canGoBack: true });

		pressEscape({ repeat: true });

		expect(back).not.toHaveBeenCalled();
	});

	it("leaves Escape typed into a text field to the field", () => {
		const { back } = renderBackLink({ canGoBack: true });
		const field = document.body.appendChild(
			document.createElement("input"),
		);

		pressEscape({ on: field });

		expect(back).not.toHaveBeenCalled();
	});

	it("lets whatever the back gesture would dismiss take Escape first", () => {
		const { back } = renderBackLink({ canGoBack: true });
		const cancelReply = vi.fn(() => false);
		backGestureEventHandlers.set(cancelReply, "screen");

		pressEscape();
		backGestureEventHandlers.delete(cancelReply);

		expect(cancelReply).toHaveBeenCalledOnce();
		expect(back).not.toHaveBeenCalled();
	});

	it("goes back on Escape past a back handler with nothing to dismiss", () => {
		const { back } = renderBackLink({ canGoBack: true });
		const idle = vi.fn(() => true);
		backGestureEventHandlers.set(idle, "overlay");

		pressEscape();
		backGestureEventHandlers.delete(idle);

		expect(idle).toHaveBeenCalledOnce();
		expect(back).toHaveBeenCalledOnce();
	});

	it("leaves a modified click to the browser", () => {
		const { back, link } = renderBackLink({ canGoBack: true });

		expect(clickFollowsLink(link, { metaKey: true })).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("leaves a modified click on the first screen to the browser", () => {
		const { back, link } = renderBackLink({ canGoBack: false });

		expect(clickFollowsLink(link, { metaKey: true })).toBe(true);
		expect(gotoMock).not.toHaveBeenCalled();
		expect(back).not.toHaveBeenCalled();
	});
});
