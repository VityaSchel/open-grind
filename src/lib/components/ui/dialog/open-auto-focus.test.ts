import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { focusOnOpen } from "./open-auto-focus";

function mountContent(html: string): HTMLElement {
	const content = document.createElement("div");
	content.tabIndex = -1;
	content.innerHTML = html;
	document.body.append(content);
	return content;
}

function focusOpener(html: string): void {
	const opener = document.createElement("div");
	opener.innerHTML = html;
	document.body.append(opener);
	opener.querySelector<HTMLElement>("#opener")?.focus();
}

function openEvent(): Event {
	return new CustomEvent("focusScope.onOpenAutoFocus", { cancelable: true });
}

function open({
	content,
	fallback,
	onOpenAutoFocus,
}: {
	content: HTMLElement;
	fallback: "content" | "library";
	onOpenAutoFocus?: (event: Event) => void;
}): Event {
	const event = openEvent();
	focusOnOpen({ content: () => content, fallback, onOpenAutoFocus })(event);
	return event;
}

beforeEach(() => {
	vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
		run(0);
		return 0;
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("focusOnOpen", () => {
	it("focuses the marked control instead of the first one", () => {
		const content = mountContent(
			'<button>Reset</button><button data-autofocus id="cancel">Cancel</button>',
		);
		open({ content, fallback: "library" });
		expect(document.activeElement?.id).toBe("cancel");
	});

	it("focuses the tab stop inside a marked group, skipping roving items", () => {
		const content = mountContent(
			'<div data-autofocus><button tabindex="-1">Top</button><button tabindex="0" id="stop">Bottom</button></div>',
		);
		open({ content, fallback: "content" });
		expect(document.activeElement?.id).toBe("stop");
	});

	it("moves on to the next marked control when the first cannot take focus", () => {
		const content = mountContent(
			'<button data-autofocus disabled>Show</button><button data-autofocus id="next">Save</button>',
		);
		open({ content, fallback: "content" });
		expect(document.activeElement?.id).toBe("next");
	});

	it("focuses the content when a marked group has nothing focusable yet", () => {
		const content = mountContent(
			"<div data-autofocus></div><button>Save</button>",
		);
		open({ content, fallback: "content" });
		expect(document.activeElement).toBe(content);
	});

	it("focuses an unmarked drawer's content", () => {
		const content = mountContent("<button>Reset</button>");
		const event = open({ content, fallback: "content" });
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(content);
	});

	it("leaves an unmarked dialog to the library's first tabbable", () => {
		const content = mountContent("<button>Close</button>");
		const event = open({ content, fallback: "library" });
		expect(event.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(document.body);
	});

	it("focuses a dialog's content when the content itself is marked", () => {
		const content = mountContent("<button>Show my post</button>");
		content.dataset.autofocus = "";
		const event = open({ content, fallback: "library" });
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(content);
	});

	it("focuses a keyboard-only target when the opener has keyboard focus", () => {
		focusOpener('<button id="opener">Add note</button>');
		const content = mountContent(
			'<button>Close</button><textarea data-autofocus="keyboard" id="note"></textarea>',
		);
		open({ content, fallback: "content" });
		expect(document.activeElement?.id).toBe("note");
	});

	it("focuses the content instead of a keyboard-only target when nothing had focus", () => {
		const content = mountContent(
			'<button>Sign out</button><button data-autofocus="keyboard">Try again</button>',
		);
		content.dataset.autofocus = "";
		const event = open({ content, fallback: "library" });
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(content);
	});

	it("does not count a focused text field as keyboard use", () => {
		focusOpener('<textarea id="opener"></textarea>');
		const content = mountContent(
			'<button data-autofocus="keyboard">Close</button>',
		);
		content.dataset.autofocus = "";
		open({ content, fallback: "library" });
		expect(document.activeElement).toBe(content);
	});

	it("keeps a caller's handler in charge when it prevents the default", () => {
		const content = mountContent(
			'<button data-autofocus id="cancel">Cancel</button>',
		);
		const event = open({
			content,
			fallback: "content",
			onOpenAutoFocus: (opened) => opened.preventDefault(),
		});
		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(document.body);
	});

	it("keeps focus that already moved inside before the frame", () => {
		const content = mountContent(
			'<button id="picked">Picked</button><button data-autofocus>Cancel</button>',
		);
		open({
			content,
			fallback: "content",
			onOpenAutoFocus: () => content.querySelector("button")?.focus(),
		});
		expect(document.activeElement?.id).toBe("picked");
	});
});
