import { afterEach, describe, expect, it, vi } from "vitest";

import {
	fitsInBand,
	holdFocusInPlace,
	revealKeyboardFocus,
	visibleBand,
	wasDisplaced,
} from "./reveal-keyboard-focus";

const releases: (() => void)[] = [];

afterEach(() => {
	for (const release of releases.splice(0)) release();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

function focusable({
	tag,
	keyboardFocus,
	parent = document.body,
}: {
	tag: string;
	keyboardFocus: boolean;
	parent?: HTMLElement;
}) {
	const element = document.createElement(tag);
	parent.append(element);
	const matches = element.matches.bind(element);
	vi.spyOn(element, "matches").mockImplementation((selector) =>
		selector === ":focus-visible" ? keyboardFocus : matches(selector),
	);
	const scrollIntoView = vi.fn();
	element.scrollIntoView = scrollIntoView;
	return { element, scrollIntoView };
}

function startRevealing() {
	releases.push(revealKeyboardFocus());
}

describe("revealKeyboardFocus", () => {
	it("scrolls a control focused from the keyboard fully into view", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
			block: "nearest",
			inline: "nearest",
		});
	});

	it("leaves focus from a pointer where the browser put it", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: false,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("leaves text fields to the browser and the soft keyboard", () => {
		startRevealing();
		const fields = [
			focusable({ tag: "input", keyboardFocus: true }),
			focusable({ tag: "textarea", keyboardFocus: true }),
		];

		for (const { element } of fields)
			element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		for (const { scrollIntoView } of fields)
			expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("leaves a roving list's focus holder where it is", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "div",
			keyboardFocus: true,
		});
		element.setAttribute("data-roving-holder", "");

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("stops every scroller around the control before revealing it, past a sideways strip", () => {
		startRevealing();
		const scroller = (style: Partial<CSSStyleDeclaration>) => {
			const element = document.createElement("div");
			Object.assign(element.style, style);
			const scrollTo = vi.fn();
			element.scrollTo = scrollTo as typeof element.scrollTo;
			return { element, scrollTo };
		};
		const messages = scroller({ overflowY: "auto" });
		const rail = scroller({ overflowX: "auto", overflowY: "auto" });
		document.body.append(messages.element);
		messages.element.append(rail.element);
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
			parent: rail.element,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		const [revealed] = scrollIntoView.mock.invocationCallOrder;
		for (const { scrollTo } of [messages, rail]) {
			expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
				top: 0,
				left: 0,
				behavior: "instant",
			});
			expect(scrollTo.mock.invocationCallOrder[0]).toBeLessThan(
				revealed!,
			);
		}
	});

	it("leaves the page where it is when focus only comes back with the window", () => {
		startRevealing();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
		});
		element.focus();
		scrollIntoView.mockClear();

		window.dispatchEvent(new FocusEvent("blur"));
		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(scrollIntoView).not.toHaveBeenCalled();

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(scrollIntoView).toHaveBeenCalledOnce();
	});

	it("still reveals another control focused after the window comes back", () => {
		startRevealing();
		const first = focusable({ tag: "button", keyboardFocus: true });
		const second = focusable({ tag: "button", keyboardFocus: true });
		first.element.focus();

		window.dispatchEvent(new FocusEvent("blur"));
		second.element.dispatchEvent(
			new FocusEvent("focusin", { bubbles: true }),
		);

		expect(second.scrollIntoView).toHaveBeenCalledOnce();
	});

	it("stops revealing once released", () => {
		revealKeyboardFocus()();
		const { element, scrollIntoView } = focusable({
			tag: "button",
			keyboardFocus: true,
		});

		element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

		expect(scrollIntoView).not.toHaveBeenCalled();
	});
});

describe("holdFocusInPlace", () => {
	function list() {
		const container = document.createElement("ul");
		container.setAttribute("tabindex", "2");
		container.style.outline = "1px solid red";
		document.body.append(container);
		return container;
	}

	it("focuses the container without scrolling or a ring", () => {
		const container = list();
		const focus = vi.spyOn(container, "focus");

		holdFocusInPlace(container);

		expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
		expect(document.activeElement).toBe(container);
		expect(container.getAttribute("tabindex")).toBe("-1");
		expect(container.hasAttribute("data-roving-holder")).toBe(true);
		expect(container.style.outline).toBe("none");
	});

	it("restores the container once focus has left it", () => {
		const container = list();
		const outside = document.createElement("button");
		document.body.append(outside);
		const release = holdFocusInPlace(container);

		release();
		expect(container.hasAttribute("data-roving-holder")).toBe(true);
		outside.focus();

		expect(container.getAttribute("tabindex")).toBe("2");
		expect(container.hasAttribute("data-roving-holder")).toBe(false);
		expect(container.style.outline).toBe("1px solid red");
	});

	it("restores the container at once when focus already moved on", () => {
		const container = list();
		container.removeAttribute("tabindex");
		const release = holdFocusInPlace(container);
		const item = document.createElement("button");
		container.append(item);
		item.focus();

		release();

		expect(container.hasAttribute("tabindex")).toBe(false);
		expect(container.hasAttribute("data-roving-holder")).toBe(false);
	});
});

describe("visibleBand", () => {
	it("spans the viewport when the list scrolls with the page", () => {
		vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

		expect(visibleBand(null)).toEqual({ top: 0, bottom: 800 });
	});

	it("leaves out the scroll padding under the floating bars and stays inside the viewport", () => {
		vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
		const scroller = document.createElement("div");
		scroller.getBoundingClientRect = () =>
			({ top: -20, bottom: 900 }) as DOMRect;
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			scrollPaddingTop: "64px",
			scrollPaddingBottom: "80px",
		} as CSSStyleDeclaration);

		expect(visibleBand(scroller)).toEqual({ top: 44, bottom: 800 });
	});
});

describe("fitsInBand", () => {
	it("accepts an element inside the band, half a pixel either way, and nothing that sticks out", () => {
		const band = { top: 100, bottom: 500 };
		const at = (top: number, bottom: number) => {
			const element = document.createElement("div");
			element.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
			return element;
		};

		expect(fitsInBand({ element: at(99.5, 500.5), band })).toBe(true);
		expect(fitsInBand({ element: at(99, 200), band })).toBe(false);
		expect(fitsInBand({ element: at(400, 501), band })).toBe(false);
	});

	it("rejects an element whose rendering the browser skips without measuring it", () => {
		const element = document.createElement("div");
		element.checkVisibility = ({ contentVisibilityAuto = false } = {}) =>
			!contentVisibilityAuto;
		const measure = vi.spyOn(element, "getBoundingClientRect");

		expect(fitsInBand({ element, band: { top: 0, bottom: 800 } })).toBe(
			false,
		);
		expect(measure).not.toHaveBeenCalled();
	});
});

describe("wasDisplaced", () => {
	function recordedMutations(change: () => void): MutationRecord[] {
		const observer = new MutationObserver(() => {});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributeFilter: ["inert"],
		});
		change();
		const records = observer.takeRecords();
		observer.disconnect();
		return records;
	}

	it("tells when an element was moved, removed or made inert", () => {
		const list = document.createElement("div");
		const [first, second, third] = ["a", "b", "c"].map((label) => {
			const item = document.createElement("button");
			item.textContent = label;
			return item;
		});
		list.append(first!, second!, third!);
		document.body.append(list);

		const moved = recordedMutations(() => list.prepend(third!));
		const removed = recordedMutations(() => second!.remove());
		first!.setAttribute("inert", "");

		expect(wasDisplaced({ element: third!, records: moved })).toBe(true);
		expect(wasDisplaced({ element: second!, records: [] })).toBe(true);
		expect(wasDisplaced({ element: first!, records: [] })).toBe(true);
		expect(wasDisplaced({ element: third!, records: removed })).toBe(false);
	});
});
