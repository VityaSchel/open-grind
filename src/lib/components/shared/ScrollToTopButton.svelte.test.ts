// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ScrollToTopButton from "./ScrollToTopButton.svelte";

const SCREEN_HEIGHT = 800;
const GLIDE_MS = 400;
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
		async glideFor(ms: number) {
			vi.advanceTimersByTime(ms);
			await settle();
		},
	};
}

describe("the scroll-to-top button", () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
	});

	afterEach(async () => {
		cleanup();
		document.body.replaceChildren();
		vi.useRealTimers();
		await setLocale({ locale: SOURCE_LOCALE });
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
		expect(view.button()).toBeNull();

		await view.glideFor(GLIDE_MS);
		expect(view.scroller.scrollTop).toBe(0);
	});

	it("glides without a jump when the top is less than a screen away", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(500);

		await view.click();
		expect(view.scroller.scrollTop).toBe(500);

		await view.glideFor(GLIDE_MS);
		expect(view.scroller.scrollTop).toBe(0);
	});

	it("starts the glide fast and slows into the top", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(SCREEN_HEIGHT);

		await view.click();
		await view.glideFor(GLIDE_MS / 4);
		const firstQuarter = SCREEN_HEIGHT - view.scroller.scrollTop;
		await view.glideFor(GLIDE_MS / 2);
		const lastQuarterStart = view.scroller.scrollTop;
		await view.glideFor(GLIDE_MS / 4);

		expect(firstQuarter).toBeGreaterThan(SCREEN_HEIGHT / 3);
		expect(lastQuarterStart).toBeLessThan(SCREEN_HEIGHT / 30);
		expect(view.scroller.scrollTop).toBe(0);
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

		await view.glideFor(GLIDE_MS);
		await view.scrollTo(400);

		expect(view.button()).not.toBeNull();
	});

	it("ignores the scroll events its own glide causes", async () => {
		const view = await mountWithScroller();
		await view.scrollTo(5000);
		await view.click();

		await view.glideFor(GLIDE_MS / 2);
		await view.dispatch("scroll");
		await view.dispatch("scrollend");

		expect(view.button()).toBeNull();
		await view.glideFor(GLIDE_MS / 2);
		expect(view.scroller.scrollTop).toBe(0);
	});

	it("renames the button when the locale changes", async () => {
		const view = await mountWithScroller({ scrollTop: 5000 });
		expect(view.button()).not.toBeNull();

		await setLocale({ locale: "en-XA" });
		await settle();

		const label = document
			.querySelector("button")
			?.getAttribute("aria-label");
		expect(label).toBe(t("shell.scrollToTopButton.a11y.label"));
		expect(label).toMatch(PSEUDO_MESSAGE);
	});
});
