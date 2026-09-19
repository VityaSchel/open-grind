// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Textarea from "./textarea.svelte";

let contentHeight = 0;
let layoutWidth = 300;
let overflowWhileMeasured = "";

beforeEach(() => {
	Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
		configurable: true,
		get(this: HTMLTextAreaElement) {
			overflowWhileMeasured = this.style.overflowY;
			return contentHeight;
		},
	});
	Object.defineProperty(HTMLTextAreaElement.prototype, "offsetWidth", {
		configurable: true,
		get: () => layoutWidth,
	});
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: new EventTarget(),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
	Reflect.deleteProperty(HTMLTextAreaElement.prototype, "offsetWidth");
	Reflect.deleteProperty(document, "fonts");
});

function renderTextarea(value: string) {
	const result = render(Textarea, {
		props: { value, style: "border: 1px solid" },
	});
	const textarea = result.container.querySelector("textarea");
	if (!textarea) throw new Error("textarea not rendered");
	return { ...result, textarea };
}

describe("Textarea field-sizing fallback", () => {
	it("leaves the height to CSS where field-sizing is supported", () => {
		vi.spyOn(CSS, "supports").mockReturnValue(true);
		contentHeight = 36;
		const { textarea } = renderTextarea("");
		expect(textarea.style.height).toBe("");
	});

	it("sizes to the content with an important height so height classes cannot pin it", () => {
		vi.spyOn(CSS, "supports").mockReturnValue(false);
		contentHeight = 76;
		const { textarea } = renderTextarea("one\ntwo\nthree");
		expect(textarea.style.height).toBe("78px");
		expect(textarea.style.getPropertyPriority("height")).toBe("important");
	});

	it("measures with the scrollbar hidden so a classic scrollbar cannot wrap an extra line", () => {
		vi.spyOn(CSS, "supports").mockReturnValue(false);
		contentHeight = 76;
		const { textarea } = renderTextarea("one\ntwo\nthree");
		expect(overflowWhileMeasured).toBe("hidden");
		expect(textarea.style.overflowY).toBe("");
	});

	it("refits when the value changes without an input event", async () => {
		vi.spyOn(CSS, "supports").mockReturnValue(false);
		contentHeight = 76;
		const { textarea, rerender } = renderTextarea("one\ntwo\nthree");
		contentHeight = 36;
		await rerender({ value: "" });
		await tick();
		expect(textarea.style.height).toBe("38px");
	});

	it("refits when a web font finishes loading", () => {
		vi.spyOn(CSS, "supports").mockReturnValue(false);
		contentHeight = 56;
		const { textarea } = renderTextarea("a draft restored before the font");
		contentHeight = 76;
		document.fonts.dispatchEvent(new Event("loadingdone"));
		expect(textarea.style.height).toBe("78px");
	});

	it("refits a width change on the next frame so the resize observer never resizes what it observes", () => {
		vi.spyOn(CSS, "supports").mockReturnValue(false);
		const observed: ResizeObserverCallback[] = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: ResizeObserverCallback) {
					observed.push(callback);
				}
				observe() {}
				disconnect() {}
			},
		);
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
			frames.push(frame),
		);
		vi.stubGlobal("cancelAnimationFrame", () => {});
		layoutWidth = 300;
		contentHeight = 56;
		const { textarea } = renderTextarea("a line that rewraps");
		layoutWidth = 200;
		contentHeight = 76;
		for (const callback of observed) callback([], {} as ResizeObserver);
		expect(textarea.style.height).toBe("58px");
		for (const frame of frames.splice(0)) frame(0);
		expect(textarea.style.height).toBe("78px");
	});
});
