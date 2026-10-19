// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
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
	afterEach(async () => {
		cleanup();
		document.body.replaceChildren();
		vi.unstubAllGlobals();
		afterNavigateCallbacks.length = 0;
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("puts the link in a Back navigation landmark", () => {
		const { link } = renderBackLink({ canGoBack: true });

		const navigation = screen.getByRole("navigation", { name: "Back" });
		expect(navigation.contains(link)).toBe(true);
	});

	it("words the landmark and the link in the active locale", async () => {
		const { link } = renderBackLink({ canGoBack: true });
		const navigation = link.closest("nav")!;

		await setLocale({ locale: "en-XA" });

		expect(navigation.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(link.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
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

	it("goes back on Escape", () => {
		const { back } = renderBackLink({ canGoBack: true });

		pressEscape();

		expect(back).toHaveBeenCalledOnce();
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
});
