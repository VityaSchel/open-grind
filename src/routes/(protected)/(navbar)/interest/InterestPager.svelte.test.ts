import { cleanup, render } from "@testing-library/svelte";
import { page } from "$app/state";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationType } from "@sveltejs/kit";
import type { ResolvedPathname } from "$app/types";

import { fakePagerLayout, WIDTH } from "$lib/util/snap-pager-test-helpers";
import InterestPager from "./InterestPager.svelte";

const TAPS = "/interest/taps";
const VIEWS = "/interest/views";
const REPLACE = { replaceState: true, noScroll: true };

const { goto, afterNavigate, navigating } = vi.hoisted(() => ({
	goto: vi.fn(),
	afterNavigate: vi.fn<(callback: () => void) => void>(),
	navigating: {
		type: null as NavigationType | null,
		to: null as { url: URL } | null,
	},
}));

vi.mock("$app/navigation", () => ({ goto, afterNavigate }));
vi.mock("$app/state", async () => {
	const { SvelteURL } = await import("svelte/reactivity");
	return { navigating, page: { url: new SvelteURL("https://app.test/") } };
});
vi.mock("./views/ViewsGrid.svelte", () => ({ default: () => {} }));
vi.mock("./taps/TapsReceivedList.svelte", () => ({ default: () => {} }));

function mountPager({ scrollLeft = WIDTH }: { scrollLeft?: number } = {}) {
	page.url.pathname = TAPS;
	window.history.replaceState(null, "", TAPS);
	navigating.type = null;
	navigating.to = null;

	const settling: { unsettled: boolean; restingTab?: number } = {
		unsettled: false,
	};
	const layout = fakePagerLayout({
		mount: () => {
			const { container } = render(InterestPager, {
				props: {
					ourProfileId: 1,
					onUnsettle: () => {
						settling.unsettled = true;
					},
					onSettle: (tab) => {
						settling.unsettled = false;
						settling.restingTab = tab;
					},
				},
			});
			const pager = container.querySelector<HTMLElement>(
				'[data-slot="interest-pager"]',
			);
			if (!pager) throw new Error("interest pager not mounted");
			return pager;
		},
	});
	layout.node.scrollLeft = scrollLeft;
	layout.measure(WIDTH);
	return { ...layout, settling };
}

function navigated() {
	navigating.type = null;
	navigating.to = null;
	for (const [callback] of afterNavigate.mock.calls) callback();
	flushSync();
}

function route(pathname: ResolvedPathname) {
	page.url.pathname = pathname;
	flushSync();
}

function loading(pathname: string) {
	navigating.type = "goto";
	navigating.to = { url: new URL(pathname, page.url) };
}

function clickSwallowed(pane: Element) {
	const row = pane.appendChild(document.createElement("button"));
	const heard = vi.fn();
	document.addEventListener("click", heard);
	const click = new MouseEvent("click", { bubbles: true, cancelable: true });
	row.dispatchEvent(click);
	document.removeEventListener("click", heard);
	row.remove();
	const unheard = heard.mock.calls.length === 0;
	expect(
		click.defaultPrevented,
		"a click is cancelled exactly when no listener hears it",
	).toBe(unheard);
	return unheard;
}

function markup(pager: { node: HTMLElement }) {
	flushSync();
	return [pager.node, ...pager.node.children].map((element) => ({
		attributes: element
			.getAttributeNames()
			.map((name) => `${name}=${element.getAttribute(name)}`),
		inert:
			element.hasAttribute("inert") ||
			(element instanceof HTMLElement && element.inert === true),
	}));
}

function panesSwallowingClicks(pager: { node: HTMLElement }) {
	expect(
		markup(pager).filter(({ inert }) => inert),
		"no pane is made inert",
	).toEqual([]);
	return [...pager.node.children]
		.filter(clickSwallowed)
		.map((pane) => pane.getAttribute("data-slot"));
}

function restOnViews({
	located = TAPS,
	pending,
}: {
	located?: string;
	pending?: { type: NavigationType; to: string };
}) {
	const pager = mountPager();
	window.history.replaceState(null, "", located);
	navigating.type = pending?.type ?? null;
	navigating.to = pending ? { url: new URL(pending.to, page.url) } : null;
	pager.scroll(0);
}

describe("InterestPager", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		goto.mockReset();
		afterNavigate.mockReset();
	});

	it("opens on the routed tab without replacing the URL", () => {
		const pager = mountPager({ scrollLeft: 0 });

		expect(pager.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "instant",
		});
		expect(goto).not.toHaveBeenCalled();
	});

	it("replaces the URL with the tab the pager rests on", () => {
		restOnViews({});

		expect(goto).toHaveBeenCalledExactlyOnceWith(VIEWS, REPLACE);
	});

	it("leaves the URL to a traversal that is in flight when the pager rests", () => {
		restOnViews({ located: "/", pending: { type: "popstate", to: "/" } });

		expect(goto).not.toHaveBeenCalled();
	});

	it("leaves the URL to another screen's navigation that is in flight", () => {
		restOnViews({ pending: { type: "link", to: "/profile/7" } });

		expect(goto).not.toHaveBeenCalled();
	});

	it("leaves the URL to a traversal that has moved the location before it is reported", () => {
		restOnViews({ located: "/" });

		expect(goto).not.toHaveBeenCalled();
	});

	it("does not repeat a replace to the same tab that is still loading", () => {
		restOnViews({ pending: { type: "goto", to: VIEWS } });

		expect(goto).not.toHaveBeenCalled();
	});

	it("replaces a tab switch that is still loading toward the other tab", () => {
		restOnViews({ pending: { type: "goto", to: TAPS } });

		expect(goto).toHaveBeenCalledExactlyOnceWith(VIEWS, REPLACE);
	});

	it("waits for the finger to lift before replacing the URL", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		pager.scroll(0);
		expect(goto).not.toHaveBeenCalled();

		pager.touch("touchend");
		expect(goto).toHaveBeenCalledExactlyOnceWith(VIEWS, REPLACE);
	});

	it("leaves a pager resting between tabs alone", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		pager.scroll(170);
		pager.touch("touchend");

		expect(goto).not.toHaveBeenCalled();
		expect(pager.scrollTo).not.toHaveBeenCalled();
	});

	it("glides to a tab picked outside the pager", () => {
		const pager = mountPager();

		route(VIEWS);

		expect(pager.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 0,
			behavior: "smooth",
		});
	});

	it("realigns to the picked tab when the pager resizes during the glide", () => {
		const pager = mountPager();
		pager.scrollTo.mockImplementation(() => {});

		route(VIEWS);
		pager.scroll(0.6 * WIDTH);
		pager.scrollTo.mockClear();
		pager.measure(500);

		expect(pager.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 0,
			behavior: "instant",
		});
	});

	it("does not scroll under a drag that moves on after its own rest changed the route", () => {
		const pager = mountPager();

		pager.scroll(0);
		expect(goto).toHaveBeenCalledExactlyOnceWith(VIEWS, REPLACE);
		pager.scroll(120);
		route(VIEWS);

		expect(pager.scrollTo).not.toHaveBeenCalled();
	});

	it("leaves a tab switch loading from outside the pager alone", () => {
		const pager = mountPager();

		loading(VIEWS);
		pager.touch("touchstart");
		pager.touch("touchend");

		expect(goto).not.toHaveBeenCalled();
	});

	it("replaces its own tab switch that is still loading when the pager comes back", () => {
		const pager = mountPager();

		pager.scroll(0);
		loading(VIEWS);
		pager.scroll(WIDTH);

		expect(goto.mock.calls).toEqual([
			[VIEWS, REPLACE],
			[TAPS, REPLACE],
		]);
	});

	it("glides to a tab picked outside the pager after its own replace was dropped", () => {
		const pager = mountPager();

		pager.scroll(0);
		loading(TAPS);
		pager.scroll(WIDTH);
		loading(VIEWS);
		route(VIEWS);

		expect(pager.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 0,
			behavior: "smooth",
		});
	});

	it("follows a tab tap that cut its own replace short, and no later rest undoes it", () => {
		const pager = mountPager();

		pager.scroll(0);
		loading(TAPS);
		navigated();

		expect(pager.scrollTo).toHaveBeenLastCalledWith({
			left: WIDTH,
			behavior: "smooth",
		});
		pager.scroll(WIDTH);
		expect(goto).toHaveBeenCalledExactlyOnceWith(VIEWS, REPLACE);
	});

	it("still glides to a tab picked outside the pager after its own rest", () => {
		const pager = mountPager();

		pager.scroll(0);
		route(VIEWS);
		route(TAPS);
		route(VIEWS);

		expect(pager.scrollTo).toHaveBeenLastCalledWith({
			left: 0,
			behavior: "smooth",
		});
		expect(pager.scrollTo).toHaveBeenCalledTimes(2);
	});

	it("swallows clicks on the tab a drag shows less than half of, and on neither once the pager rests", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		pager.scroll(0.6 * WIDTH);
		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-views"]);

		pager.scroll(0.4 * WIDTH);
		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-taps"]);

		pager.scroll(0);
		expect(panesSwallowingClicks(pager)).toEqual([]);
	});

	it("swallows clicks on the tab being left as soon as a lifted finger lets the pager glide on, before it is halfway", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		pager.scroll(0.8 * WIDTH);
		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-views"]);

		pager.touch("touchend");
		pager.scroll(0.7 * WIDTH);

		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-taps"]);
	});

	it("swallows clicks on the incoming tab again when a lifted finger lets the pager fall back", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		pager.scroll(0.8 * WIDTH);
		pager.touch("touchend");
		pager.scroll(0.9 * WIDTH);

		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-views"]);
	});

	it("swallows clicks on the tab being left from the first scroll of a glide to a tab picked outside the pager", () => {
		const pager = mountPager();

		route(VIEWS);
		expect(panesSwallowingClicks(pager)).toEqual([]);

		pager.scroll(0.9 * WIDTH);

		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-taps"]);
	});

	it("keeps swallowing clicks on the tab being left when a press on the pager drops the glide before halfway", () => {
		const pager = mountPager();

		route(VIEWS);
		pager.scroll(0.9 * WIDTH);
		pager.node.dispatchEvent(new Event("pointerdown", { bubbles: true }));

		expect(panesSwallowingClicks(pager)).toEqual(["interest-pane-taps"]);
	});

	it("swallows clicks on neither tab when a switch lands in a single jump", () => {
		const pager = mountPager();

		route(VIEWS);
		pager.scroll(0);

		expect(panesSwallowingClicks(pager)).toEqual([]);
	});

	it("leaves the attributes of the pager and its tabs as they were through a drag and the glide after it", () => {
		const pager = mountPager();
		const resting = markup(pager);

		pager.touch("touchstart");
		pager.scroll(0.6 * WIDTH);
		expect(markup(pager)).toEqual(resting);

		pager.scroll(0.4 * WIDTH);
		expect(markup(pager)).toEqual(resting);

		pager.touch("touchend");
		pager.scroll(0.2 * WIDTH);
		expect(markup(pager)).toEqual(resting);

		pager.scroll(0);
		expect(markup(pager)).toEqual(resting);
	});

	it("is unsettled from the moment a finger lands on it until that finger lifts on a tab", () => {
		const pager = mountPager();
		expect(pager.settling).toEqual({ unsettled: false, restingTab: 1 });

		pager.touch("touchstart");
		expect(pager.settling).toEqual({ unsettled: true, restingTab: 1 });

		pager.scroll(0.4 * WIDTH);
		pager.scroll(0);
		expect(pager.settling).toEqual({ unsettled: true, restingTab: 1 });

		pager.touch("touchend");
		expect(pager.settling).toEqual({ unsettled: false, restingTab: 0 });
	});

	it("settles on its tab again when a finger lifts without having paged", () => {
		const pager = mountPager();

		pager.touch("touchstart");
		expect(pager.settling).toEqual({ unsettled: true, restingTab: 1 });

		pager.touch("touchend");
		expect(pager.settling).toEqual({ unsettled: false, restingTab: 1 });
	});

	it("is unsettled for the whole glide to a tab picked outside the pager", () => {
		const pager = mountPager();

		route(VIEWS);
		expect(pager.settling).toEqual({ unsettled: false, restingTab: 1 });

		pager.scroll(0.9 * WIDTH);
		expect(pager.settling).toEqual({ unsettled: true, restingTab: 1 });

		pager.scroll(0);
		expect(pager.settling).toEqual({ unsettled: false, restingTab: 0 });
	});
});
