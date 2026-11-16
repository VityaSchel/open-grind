// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string, args?: unknown) => Promise<void>>(() =>
		Promise.resolve(),
	),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke,
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE, t } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import ScrollToTopButton from "./ScrollToTopButton.svelte";

const SCREEN_HEIGHT = 800;
const GLIDE_MS = 400;
async function settle() {
	await tick();
	await tick();
}

function holdFlights() {
	const landings: Array<() => void> = [];
	const spy = vi
		.spyOn(Element.prototype, "animate")
		.mockImplementation((_, options) => {
			const animation = {
				cancel: () => {},
				currentTime: 0,
				playState: "finished",
				effect: null,
				onfinish: null as (() => void) | null,
			};
			const land = () => animation.onfinish?.();
			if (typeof options === "object" && options.duration)
				landings.push(land);
			else queueMicrotask(land);
			return animation as unknown as Animation;
		});
	return {
		async land() {
			for (const land of landings.splice(0)) land();
			await settle();
		},
		restore: () => spy.mockRestore(),
	};
}

async function mountWithScroller({
	scrollTop = 0,
	text,
	onjump,
}: { scrollTop?: number; text?: string; onjump?: () => void } = {}) {
	const scroller = document.createElement("div");
	scroller.style.overflowY = "auto";
	Object.defineProperty(scroller, "clientHeight", {
		value: SCREEN_HEIGHT,
		configurable: true,
	});
	Object.defineProperty(scroller, "scrollHeight", {
		value: 20_000,
		configurable: true,
	});
	vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 402, SCREEN_HEIGHT),
	);
	scroller.scrollTop = scrollTop;
	document.body.append(scroller);
	document.elementFromPoint = () => scroller;

	let labeled = false;
	const view = render(ScrollToTopButton, {
		props: {
			container: scroller,
			text,
			onjump,
			get labeled() {
				return labeled;
			},
			set labeled(value) {
				labeled = value;
			},
		},
	});
	await settle();

	const button = () =>
		view.container.querySelector<HTMLElement>(
			text === undefined
				? '[aria-label="Scroll to top"]'
				: `[aria-label="${text}, scroll to top"]`,
		);
	return {
		scroller,
		button,
		labeled: () => labeled,
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
		runningOn("macos");
	});

	afterEach(async () => {
		cleanup();
		document.body.replaceChildren();
		vi.useRealTimers();
		resetPlatform();
		invoke.mockClear();
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

	it("on iOS stops the coasting list under its center before the jump", async () => {
		runningOn("ios");
		let stopped = () => {};
		invoke.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					stopped = resolve;
				}),
		);
		const view = await mountWithScroller();
		await view.scrollTo(5000);

		await view.click();
		expect(invoke).toHaveBeenCalledWith("stop_scroll_momentum", {
			at: { x: 201, y: SCREEN_HEIGHT / 2 },
		});
		expect(view.button()).toBeNull();
		expect(view.scroller.scrollTop).toBe(5000);

		stopped();
		await settle();
		expect(view.scroller.scrollTop).toBe(SCREEN_HEIGHT);
		await view.glideFor(GLIDE_MS);
		expect(view.scroller.scrollTop).toBe(0);
	});

	it("on iOS answers a status-bar tap with its own scroll to the top", async () => {
		runningOn("ios");
		const view = await mountWithScroller();
		await view.scrollTo(5000);

		window.__iosStatusBarTap?.();
		await settle();

		expect(view.button()).toBeNull();
		expect(view.scroller.scrollTop).toBe(SCREEN_HEIGHT);
		await view.glideFor(GLIDE_MS);
		expect(view.scroller.scrollTop).toBe(0);

		cleanup();
		await view.scrollTo(5000);
		window.__iosStatusBarTap?.();
		await settle();
		expect(
			view.scroller.scrollTop,
			"an unmounted button stops answering",
		).toBe(5000);
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

	it("carries a label that names what tapping shows, and reports the tap", async () => {
		const onjump = vi.fn();
		const view = await mountWithScroller({
			scrollTop: 5000,
			text: "New posts",
			onjump,
		});

		expect(view.button()?.textContent.trim()).toBe("New posts");

		await view.click();

		expect(onjump).toHaveBeenCalledOnce();
		expect(view.scroller.scrollTop).toBe(SCREEN_HEIGHT);
	});

	it("holds the space for its label until the labeled chip has flown out", async () => {
		const flights = holdFlights();
		const view = await mountWithScroller({
			scrollTop: 5000,
			text: "New posts",
		});
		await flights.land();
		expect(view.labeled()).toBe(true);

		await view.click();
		expect(view.button()).not.toBeNull();
		expect(view.labeled()).toBe(true);

		await flights.land();
		expect(view.button()).toBeNull();
		expect(view.labeled()).toBe(false);
		flights.restore();
	});

	it("does not hold space for a chip without a label", async () => {
		const view = await mountWithScroller({ scrollTop: 5000 });

		expect(view.button()).not.toBeNull();
		expect(view.labeled()).toBe(false);
	});
});
