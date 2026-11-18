import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { releaseTiming, stackMotion, type StackMotion } from "./motion";
import type { Snapshot } from "./snapshot";
import { fakeHistory, fakeSurface, settleLast } from "./stack-test-helpers";
import { SwipeBackCore } from "./swipe-back-core.svelte";

const androidMotion = stackMotion({ platform: "android" });

function picture(path: string): Snapshot {
	return { node: document.createElement("div"), path, restore: vi.fn() };
}

function makeCore({
	motion = androidMotion,
	earlier = ["/settings"],
	pending = false,
}: { motion?: StackMotion; earlier?: string[]; pending?: boolean } = {}) {
	fakeHistory({ paths: [...earlier, "/settings/app"] });
	const page = {
		behind: picture("/settings") as Snapshot | undefined,
		front: document.createElement("div") as HTMLElement | null,
		pending,
	};
	const adopt = vi.fn();
	const { surface, applied, animations } = fakeSurface();
	const core = new SwipeBackCore({
		surface,
		motion,
		reducedMotion: () => false,
		host: {
			front: () => page.front,
			ghostBehind: () => page.behind,
			adopt,
			navigationPending: () => page.pending,
		},
	});
	return { core, page, adopt, applied, animations };
}

function committed(harness: ReturnType<typeof makeCore>, progress = 0.6) {
	harness.core.begin();
	harness.core.track(progress);
	harness.core.commit();
}

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("SwipeBackCore offering a swipe", () => {
	it("offers one only with a snapshot behind and a live page in front", () => {
		const { core, page } = makeCore();
		expect(core.offersSwipeBack).toBe(true);

		page.behind = undefined;
		expect(core.offersSwipeBack).toBe(false);
		expect(core.begin()).toBe(false);
		expect(core.ghost).toBeNull();

		page.behind = picture("/settings");
		page.front = null;
		expect(core.offersSwipeBack).toBe(false);
		expect(core.begin()).toBe(false);
	});
});

describe("SwipeBackCore tracking a swipe", () => {
	it("reveals the snapshot behind and follows the finger", async () => {
		const { core, page, applied } = makeCore();
		const behind = page.behind!;

		expect(core.begin()).toBe(true);
		expect(core.tracking).toBe(true);
		expect(core.moving).toBe(true);
		expect(core.ghost).toBe(behind);
		expect(core.liveRole).toBe("front");

		await tick();
		expect(behind.restore).toHaveBeenCalledOnce();

		core.track(0.4);
		expect(applied.at(-1)).toBe(0.4);
	});

	it("returns the page without going back when the swipe is canceled", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const { core, applied, animations } = makeCore();
		core.begin();
		core.track(0.3);

		core.cancel();

		expect(animations.at(-1)).toMatchObject({
			from: 0.3,
			to: 0,
			easing: androidMotion.cancelEasing,
		});
		expect(core.committing).toBe(false);
		await settleLast(animations);
		expect(back).not.toHaveBeenCalled();
		expect(core.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
		expect(core.offersSwipeBack).toBe(true);
	});
});

describe("SwipeBackCore committing a swipe", () => {
	it("settles at the finger's speed, then goes back once", async () => {
		const ios = stackMotion({ platform: "ios" });
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const { core, animations } = makeCore({ motion: ios });
		core.begin();
		core.track(0.3);

		core.commit({ velocity: 0.8 });

		expect(animations.at(-1)).toMatchObject(
			releaseTiming({
				distance: 0.7,
				velocity: 0.8,
				spring: ios.release!,
			}),
		);
		expect(core.committing).toBe(true);
		expect(back).not.toHaveBeenCalled();
		await settleLast(animations);
		expect(back).toHaveBeenCalledOnce();
	});

	it("takes the focus off the page it commits away from, closing the keyboard", () => {
		vi.spyOn(history, "back").mockImplementation(() => {});
		const { core } = makeCore();
		const field = document.createElement("input");
		document.body.append(field);
		field.focus();

		core.begin();
		core.cancel();
		expect(document.activeElement).toBe(field);

		core.begin();
		core.commit();
		expect(document.activeElement).not.toBe(field);
	});

	it("keeps offering a swipe while the commit settles, and a second swipe pays the Back at once instead of tracking", () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore();
		const { core, applied } = harness;
		committed(harness);

		expect(core.offersSwipeBack).toBe(true);
		expect(core.begin()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
		expect(applied.at(-1)).toBe(1);
		expect(core.tracking).toBe(false);
		expect(core.offersSwipeBack).toBe(false);
	});

	it("restores the page instead of going back into an empty history", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore({ earlier: [] });
		const { core, applied, animations } = harness;
		committed(harness, 0.9);

		expect(core.committing).toBe(false);
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(core.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
	});

	it("skips its Back and slides the page home when another navigation is already under way", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore({ pending: true });
		const { core, animations } = harness;
		committed(harness);

		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(core.committing).toBe(false);
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: androidMotion.cancelEasing,
		});
		await settleLast(animations);
		expect(core.ghost).toBeNull();
		expect(core.startNavigation().adopt).toBeUndefined();
	});

	it("slides the page back when the Back it took never lands", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore();
		const { core, animations } = harness;
		committed(harness);
		await settleLast(animations);

		vi.advanceTimersByTime(999);
		const settles = animations.length;
		vi.advanceTimersByTime(1);

		expect(animations).toHaveLength(settles + 1);
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });
		expect(core.committing).toBe(false);
		await settleLast(animations);
		expect(core.ghost).toBeNull();
		expect(core.offersSwipeBack).toBe(true);
	});
});

describe("SwipeBackCore across navigations", () => {
	it("hands the navigation its own Back caused to the host to adopt, and only that one", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore();
		const { core, adopt, animations } = harness;
		committed(harness);
		await settleLast(animations);

		const landing = core.startNavigation();
		expect(core.offersSwipeBack).toBe(true);
		expect(adopt).not.toHaveBeenCalled();
		landing.adopt?.();
		expect(adopt).toHaveBeenCalledOnce();

		expect(core.startNavigation().adopt).toBeUndefined();
		const settles = animations.length;
		vi.advanceTimersByTime(1000);
		expect(animations, "the landed Back never slides back").toHaveLength(
			settles,
		);
	});

	it("drops the owed Back when another navigation starts before the commit settles", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeCore();
		const { core, animations } = harness;
		committed(harness);

		const navigation = core.startNavigation();
		await settleLast(animations);

		expect(navigation.adopt).toBeUndefined();
		expect(core.committing).toBe(false);
		expect(back).not.toHaveBeenCalled();
		expect(core.ghost).toBeNull();
	});

	it("stops a gesture in flight when a navigation starts", () => {
		const { core } = makeCore();
		core.begin();

		core.startNavigation();
		core.track(0.5);
		core.commit();

		expect(core.tracking).toBe(false);
		expect(core.committing).toBe(false);
	});

	it("marks the work of every earlier navigation stale", () => {
		const { core } = makeCore();
		const first = core.startNavigation();
		const second = core.startNavigation();

		expect(core.isStale(first.generation)).toBe(true);
		expect(core.isStale(second.generation)).toBe(false);
	});

	it("rests with the live page in front and nothing behind", () => {
		const { core, applied } = makeCore();
		core.begin();
		core.liveRole = "back";

		core.rest();

		expect(core.ghost).toBeNull();
		expect(core.liveRole).toBe("front");
		expect(applied.at(-1)).toBe(0);
	});
});
