// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import ScrollToTopButton from "./ScrollToTopButton.svelte";

const SCREEN_HEIGHT = 800;

async function settle() {
	await tick();
	await tick();
}

async function mountWithScroller({ scrollTop = 0 } = {}) {
	const scroller = document.createElement("div");
	Object.defineProperty(scroller, "clientHeight", {
		value: SCREEN_HEIGHT,
		configurable: true,
	});
	Object.defineProperty(scroller, "scrollHeight", {
		value: 20_000,
		configurable: true,
	});
	const scroll = vi.fn();
	scroller.scroll = scroll;
	scroller.scrollTop = scrollTop;
	document.body.append(scroller);

	const view = render(ScrollToTopButton, { props: { container: scroller } });
	await settle();

	const button = () =>
		view.container.querySelector<HTMLElement>(
			'[aria-label="Scroll to top"]',
		);
	return {
		scroller,
		scroll,
		button,
		async scrollTo(top: number) {
			scroller.scrollTop = top;
			scroller.dispatchEvent(new Event("scroll"));
			await settle();
		},
		async dispatch(type: string) {
			scroller.dispatchEvent(new Event(type));
			await settle();
		},
		async click() {
			button()?.click();
			await settle();
		},
	};
}

describe("the scroll-to-top button", () => {
	afterEach(() => {
		cleanup();
		document.body.replaceChildren();
	});

	it("appears once the scroller leaves the top and hides on the way back", async () => {
		const view = await mountWithScroller();
		expect(view.button()).toBeNull();

		await view.scrollTo(16);
		expect(view.button()).toBeNull();

		await view.scrollTo(17);
		expect(view.button()).not.toBeNull();

		await view.scrollTo(16);
		expect(view.button()).toBeNull();
	});

	it("appears straight away on a scroller that is handed over already scrolled", async () => {
		const view = await mountWithScroller({ scrollTop: 5000 });

		expect(view.button()).not.toBeNull();
	});

	it("flies in instead of popping", async () => {
		const animate = vi.spyOn(Element.prototype, "animate");
		const view = await mountWithScroller();

		await view.scrollTo(400);

		expect(view.button()).not.toBeNull();
		expect(animate).toHaveBeenCalled();
		animate.mockRestore();
	});

	it("jumps to within one screen of the top before gliding the rest", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(5000);

		await view.click();

		expect(view.scroller.scrollTop).toBe(SCREEN_HEIGHT);
		expect(view.scroll).toHaveBeenCalledWith({
			top: 0,
			behavior: "smooth",
		});
		expect(view.button()).toBeNull();
	});

	it("glides without a jump when the top is less than a screen away", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(500);

		await view.click();

		expect(view.scroller.scrollTop).toBe(500);
		expect(view.scroll).toHaveBeenCalledWith({
			top: 0,
			behavior: "smooth",
		});
	});

	for (const takeover of ["wheel", "touchstart"]) {
		it(`stays hidden while the glide runs and returns on ${takeover}`, async () => {
			const view = await mountWithScroller();
			await view.scrollTo(5000);
			await view.click();

			await view.scrollTo(400);
			expect(view.button()).toBeNull();

			await view.dispatch(takeover);
			await view.scrollTo(400);
			expect(view.button()).not.toBeNull();
		});
	}

	it("tracks the scroller again once a glide lands", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(5000);
		await view.click();

		await view.scrollTo(0);
		await view.scrollTo(400);

		expect(view.button()).not.toBeNull();
	});

	it("releases the button on the scroll end of an interrupted glide", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(5000);
		await view.click();

		view.scroller.scrollTop = 400;
		await view.dispatch("scrollend");

		expect(view.button()).not.toBeNull();
	});

	it("releases the button when a glide never lands", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const view = await mountWithScroller();
			await view.scrollTo(5000);
			await view.click();

			vi.advanceTimersByTime(1500);
			await settle();

			expect(view.button()).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});
