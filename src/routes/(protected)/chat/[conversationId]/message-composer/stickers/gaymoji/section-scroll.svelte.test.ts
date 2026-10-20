import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionScroll } from "./section-scroll.svelte";

const VIEWPORT_PX = 800;

function stubRect(element: Element, rect: Partial<DOMRect>) {
	element.getBoundingClientRect = () =>
		({ top: 0, bottom: 0, height: 0, ...rect }) as DOMRect;
}

function mountSection({
	contentTop,
	stripHeight,
	headerTop,
	scrollHeight = 10_000,
	lastKey,
}: {
	contentTop: number;
	stripHeight: number;
	headerTop: number;
	scrollHeight?: number;
	lastKey?: string;
}) {
	const scroller = document.createElement("div");
	const content = document.createElement("div");
	const strip = document.createElement("nav");
	const header = document.createElement("h3");
	scroller.style.overflowY = "auto";
	content.append(strip, header);
	scroller.append(content);
	document.body.append(scroller);
	stubRect(scroller, { top: 0, bottom: VIEWPORT_PX, height: VIEWPORT_PX });
	Object.defineProperty(scroller, "clientHeight", { value: VIEWPORT_PX });
	Object.defineProperty(scroller, "scrollHeight", { value: scrollHeight });
	const scrollTopWrites: number[] = [];
	Object.defineProperty(scroller, "scrollTop", {
		get: () => scrollTopWrites.at(-1) ?? 0,
		set: (value: number) => scrollTopWrites.push(value),
	});
	stubRect(content, { top: contentTop });
	stubRect(strip, {
		top: contentTop,
		bottom: contentTop + stripHeight,
		height: stripHeight,
	});
	Object.defineProperty(strip, "offsetHeight", {
		value: Math.round(stripHeight),
	});
	header.getBoundingClientRect = () =>
		({
			top: headerTop - (scrollTopWrites.at(-1) ?? 0),
			bottom: 0,
			height: 0,
		}) as DOMRect;
	const scrollTo = vi.fn();
	scroller.scrollTo = scrollTo;
	const release = vi.fn();
	const holdSheetSize = vi.fn(() => release);
	const scroll = new SectionScroll({
		keys: () =>
			lastKey === undefined ? ["section"] : ["section", lastKey],
		strip: () => strip,
		holdSheetSize,
	});
	scroll.headers.register("section")(header);
	const stop = scroll.follow(content);
	const reach = (top: number) => {
		scrollTopWrites.splice(0, scrollTopWrites.length, top);
		scroller.dispatchEvent(new Event("scroll"));
	};
	return {
		scroll,
		scroller,
		strip,
		scrollTo,
		scrollTopWrites,
		holdSheetSize,
		release,
		reach,
		stop,
	};
}

afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("SectionScroll", () => {
	it("jumps to the first whole pixel that puts a title at or under a strip of fractional height", () => {
		const { scroll, scrollTo, stop } = mountSection({
			contentTop: 0,
			stripHeight: 60.5,
			headerTop: 2000.75,
		});

		scroll.jumpTo("section");

		expect(scrollTo).toHaveBeenCalledWith(
			expect.objectContaining({ top: 1941 }),
		);
		stop();
	});

	it("glides from the collapsed sheet to a section in one smooth scroll", () => {
		const { scroll, scrollTo, scrollTopWrites, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 2543,
		});

		scroll.jumpTo("section");

		expect(scrollTopWrites).toEqual([]);
		expect(scrollTo).toHaveBeenCalledOnce();
		expect(scrollTo).toHaveBeenCalledWith({
			top: 2483,
			behavior: "smooth",
		});
		stop();
	});

	it("holds the sheet's size until the glide arrives", () => {
		const { scroll, holdSheetSize, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		expect(holdSheetSize).toHaveBeenCalledOnce();
		reach(150);
		reach(400);
		expect(release).not.toHaveBeenCalled();

		reach(483);

		expect(release).toHaveBeenCalledOnce();
		expect(scroll.current).toBe("section");
		stop();
	});

	it("counts a glide that stops one rounding step short on a scaled screen as arrived", () => {
		vi.stubGlobal("devicePixelRatio", 2.625);
		const { scroll, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		reach(481.7);

		expect(release).toHaveBeenCalledOnce();
		stop();
	});

	it("keeps the picked section when the scroll that landed it reports the bottom", () => {
		const { scroll, scroller, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
			scrollHeight: 1283,
			lastKey: "other",
		});

		scroll.jumpTo("section");
		reach(483);
		scroller.dispatchEvent(new Event("scroll"));

		expect(scroll.current).toBe("section");

		reach(300);
		reach(483);

		expect(scroll.current).toBe("other");
		stop();
	});

	it("keeps holding the sheet's size when the strip is pressed again mid-glide", () => {
		const { scroll, scroller, strip, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		reach(200);
		strip.dispatchEvent(new Event("pointerdown", { bubbles: true }));

		expect(release).not.toHaveBeenCalled();

		scroller.dispatchEvent(new Event("pointerdown"));

		expect(release).toHaveBeenCalledOnce();
		stop();
	});

	it.each([
		{ name: "a finger takes over", event: "pointerdown" },
		{ name: "the browser takes the finger to pan", event: "pointercancel" },
		{ name: "a wheel takes over", event: "wheel" },
		{ name: "the scroll ends", event: "scrollend" },
	])("lets go of the sheet's size when $name", ({ event }) => {
		const { scroll, scroller, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		reach(200);
		scroller.dispatchEvent(new Event(event));

		expect(release).toHaveBeenCalledOnce();
		stop();
	});

	it("lets go of the sheet's size after a second without scrolling", () => {
		vi.useFakeTimers();
		const { scroll, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		reach(200);
		vi.advanceTimersByTime(999);
		expect(release).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);

		expect(release).toHaveBeenCalledOnce();
		stop();
	});

	it("keeps one hold across a second tap mid-glide", () => {
		const { scroll, holdSheetSize, release, reach, stop } = mountSection({
			contentTop: 314,
			stripHeight: 60,
			headerTop: 543,
		});

		scroll.jumpTo("section");
		reach(200);
		scroll.jumpTo("section");
		reach(483);

		expect(holdSheetSize).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
		stop();
	});
});
