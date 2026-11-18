import { flushSync, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { TRANSPARENT_PIXEL } from "#lib/util/load-when-visible.ts";
import { stackMotion } from "./motion";
import { holdScreenLanding, registerGhostFixup } from "./screen-root";
import { ScreenSnapshots } from "./screen-snapshots.svelte";
import {
	LANDING_CAP_MS,
	PREPARED_QUIET_MS,
	SCREEN_ELEMENT_BUDGET,
	ScreenStackState,
} from "./screen-stack-state.svelte";
import {
	fakeHistory,
	fakeSurface,
	navigationEvent,
	settleLast,
} from "./stack-test-helpers";

const PROFILE = "/(protected)/(navbar)/profile/[profileId]";
const EDIT_PROFILE = "/(protected)/(navbar)/settings/(subpage)/profile";
const APP_SETTINGS = "/(protected)/(navbar)/settings/(subpage)/app";
const RIGHT_NOW = "/(protected)/(navbar)/right-now";

const iosMotion = stackMotion({ platform: "ios" });

type Harness = ReturnType<typeof makeScreenStack>;

function makeScreenStack({ at = "/" }: { at?: string } = {}) {
	const history = fakeHistory({ paths: [at] });
	const snapshots = new ScreenSnapshots({ historyIndex: history.index });
	snapshots.navigated({ type: "link" });

	const root = document.createElement("div");
	root.innerHTML = `<p>${at}</p>`;
	document.body.append(root);
	const page = { root: root as HTMLElement | null, pending: false };

	const { surface, applied, animations } = fakeSurface();
	const stack = new ScreenStackState({
		surface,
		motion: iosMotion,
		reducedMotion: () => false,
		snapshots,
		root: () => page.root,
		front: () => page.root,
		navigationPending: () => page.pending,
	});

	return { stack, history, snapshots, root, page, applied, animations };
}

function go({
	harness: { stack, history, snapshots, root },
	to,
	toRoute,
	delta,
	replace = false,
}: {
	harness: Harness;
	to: string;
	toRoute?: string;
	delta?: number;
	replace?: boolean;
}) {
	const from = history.path()!;
	if (delta !== undefined) history.go(delta);
	else if (replace) history.replace(to);
	else history.push(to);
	expect(history.path(), "history lands on the page navigated to").toBe(to);

	snapshots.navigating();
	const landed = stack.navigate(
		navigationEvent({ from, to, delta, toRoute }),
	);
	root.innerHTML = `<p>${to}</p>`;
	snapshots.navigated({ type: delta === undefined ? "link" : "popstate" });
	flushSync();
	return landed;
}

async function committed({ harness }: { harness: Harness }) {
	harness.stack.beginSwipeBack();
	harness.stack.trackSwipeBack(0.6);
	harness.stack.commitSwipeBack({ velocity: 1 });
	await settleLast(harness.animations);
}

function rect({ top }: { top: number }): DOMRect {
	return { top, bottom: top + 100, left: 0, right: 100 } as DOMRect;
}

async function flushLanding() {
	for (let turn = 0; turn < 20; turn++) {
		vi.advanceTimersByTime(0);
		await Promise.resolve();
	}
	flushSync();
}

function touch(type: "touchstart" | "touchend", { held }: { held: number }) {
	const event = new Event(type);
	Object.defineProperty(event, "touches", { value: { length: held } });
	dispatchEvent(event);
}

beforeEach(() => runningOn("ios"));

afterEach(() => {
	document.body.innerHTML = "";
	resetPlatform();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("ScreenStackState capturing the screen behind", () => {
	it.each(["ios", "android"] as const)(
		"stages a hidden picture of the grid behind a profile opened from it on %s",
		(platform) => {
			runningOn(platform);
			const harness = makeScreenStack({ at: "/" });

			go({ harness, to: "/profile/7", toRoute: PROFILE });

			const { stack } = harness;
			expect(stack.staged?.path).toBe("/");
			expect(stack.staged?.node.textContent).toBe("/");
			expect(stack.staged?.node.dataset.slot).toBe("screen-ghost");
			expect(stack.revealed).toBe(false);
			expect(stack.offersSwipeBack).toBe(true);
		},
	);

	it.each(["macos", "linux", "windows"] as const)(
		"captures nothing and offers no swipe on %s",
		(platform) => {
			runningOn(platform);
			const harness = makeScreenStack({ at: "/" });

			go({ harness, to: "/profile/7", toRoute: PROFILE });
			go({ harness, to: "/settings/profile", toRoute: EDIT_PROFILE });

			expect(harness.stack.staged).toBeNull();
			expect(harness.stack.offersSwipeBack).toBe(false);
		},
	);

	it("offers the swipe back to the launch screen, whose bare tauri://localhost URL has an empty pathname", () => {
		const harness = makeScreenStack({ at: "/" });
		const { stack, history, snapshots, root } = harness;
		history.push("/profile/7");
		snapshots.navigating();
		const navigation = navigationEvent({
			from: "/",
			to: "/profile/7",
			toRoute: PROFILE,
		});
		const launch = new URL("tauri://localhost");
		expect(launch.pathname).toBe("");
		stack.navigate({
			...navigation,
			from: { ...navigation.from!, url: launch },
		});
		root.innerHTML = "<p>/profile/7</p>";
		snapshots.navigated({ type: "link" });
		flushSync();

		expect(stack.staged?.path).toBe("/");
		expect(stack.offersSwipeBack).toBe(true);
	});

	it("captures the screen a settings page is entered from outside Settings", () => {
		const harness = makeScreenStack({ at: "/profile/7" });

		go({ harness, to: "/settings/profile", toRoute: EDIT_PROFILE });

		expect(harness.stack.staged?.path).toBe("/profile/7");
		expect(harness.stack.offersSwipeBack).toBe(true);
	});

	it("leaves a settings page pushed inside Settings to the page stack", () => {
		const harness = makeScreenStack({ at: "/settings" });

		go({ harness, to: "/settings/app", toRoute: APP_SETTINGS });

		expect(harness.stack.staged).toBeNull();
		expect(harness.stack.offersSwipeBack).toBe(false);
	});

	it("captures nothing when a navigation replaces the profile shown", () => {
		const harness = makeScreenStack({ at: "/profile/7" });

		go({ harness, to: "/profile/8", toRoute: PROFILE, replace: true });

		expect(harness.snapshots.behind("screen")).toBeUndefined();
		expect(harness.stack.staged).toBeNull();
	});

	it("skips a screen over the element budget, with a note and no swipe", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const harness = makeScreenStack({ at: "/" });
		harness.root.innerHTML = "<i></i>".repeat(SCREEN_ELEMENT_BUDGET + 1);

		go({ harness, to: "/profile/7", toRoute: PROFILE });

		expect(harness.stack.staged).toBeNull();
		expect(harness.stack.offersSwipeBack).toBe(false);
		expect(info).toHaveBeenCalledOnce();
	});

	it("measures each capture", () => {
		const measure = vi.spyOn(performance, "measure");
		const harness = makeScreenStack({ at: "/" });

		go({ harness, to: "/profile/7", toRoute: PROFILE });

		expect(measure).toHaveBeenCalledWith(
			"screen-stack-capture",
			expect.objectContaining({ detail: { elements: 1 } }),
		);
	});

	it("runs the fixup the screen registered each time its picture is revealed", async () => {
		const fixup = vi.fn();
		const unregister = registerGhostFixup({ path: "/", fixup });
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		unregister();

		harness.stack.beginSwipeBack();
		await tick();

		expect(fixup).toHaveBeenCalledOnce();
		expect(fixup).toHaveBeenCalledWith(harness.stack.staged?.node);
	});
});

describe("ScreenStackState preparing for a swipe", () => {
	it("reveals the staged picture without mounting anything, and hides it once no touch or scroll is left for a while", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const { stack } = harness;
		const staged = stack.staged!;
		const restore = vi.spyOn(staged, "restore");

		const undo = stack.prepareSwipeBack();
		expect(stack.revealed).toBe(true);
		expect(stack.staged).toBe(staged);
		await tick();
		expect(restore).toHaveBeenCalledOnce();

		touch("touchend", { held: 0 });
		undo();
		vi.advanceTimersByTime(PREPARED_QUIET_MS - 1);
		dispatchEvent(new Event("scroll"));
		vi.advanceTimersByTime(PREPARED_QUIET_MS - 1);
		expect(stack.revealed, "a scroll keeps it revealed").toBe(true);

		vi.advanceTimersByTime(1);
		expect(stack.revealed).toBe(false);
		expect(stack.staged).toBe(staged);
	});

	it("keeps the picture revealed while a touch is still down when the prepare is undone", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const { stack } = harness;

		const undo = stack.prepareSwipeBack();
		undo();
		vi.advanceTimersByTime(PREPARED_QUIET_MS * 4);
		expect(stack.revealed).toBe(true);

		touch("touchend", { held: 0 });
		vi.advanceTimersByTime(PREPARED_QUIET_MS);
		expect(stack.revealed).toBe(false);
	});

	it("prepares nothing without a picture behind", () => {
		const harness = makeScreenStack({ at: "/" });

		harness.stack.prepareSwipeBack()();

		expect(harness.stack.revealed).toBe(false);
	});
});

describe("ScreenStackState during a swipe", () => {
	it("keeps a running swipe through a replace, as when the profile pages", () => {
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const { stack, applied } = harness;
		const grid = stack.staged;
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.3);

		go({ harness, to: "/profile/8", toRoute: PROFILE, replace: true });

		expect(stack.tracking).toBe(true);
		expect(stack.staged).toBe(grid);
		stack.trackSwipeBack(0.5);
		expect(applied.at(-1)).toBe(0.5);
	});

	it("rests without a second Back when another navigation starts during the committed settle", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const { stack, animations } = harness;
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack({ velocity: 1 });
		expect(stack.committing).toBe(true);

		go({ harness, to: "/right-now", toRoute: RIGHT_NOW });

		expect(stack.committing).toBe(false);
		expect(stack.moving, "the picture goes at once").toBe(false);
		expect(stack.covering).toBe(false);
		await settleLast(animations);
		expect(back).not.toHaveBeenCalled();
	});

	it("keeps offering while its committed settle runs, so a second swipe pays the owed Back", () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const { stack } = harness;
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack();

		expect(stack.offersSwipeBack).toBe(true);
		expect(stack.moving).toBe(true);
		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});
});

describe("ScreenStackState adopting the screen it lands on", () => {
	async function landedBack() {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const ghost = harness.stack.staged;
		await committed({ harness });
		harness.root.style.transform = "translate3d(100%,0,0)";
		return { harness, ghost };
	}

	it("raises the picture over the landing screen and clears the front's slide before the screen mounts", async () => {
		const { harness, ghost } = await landedBack();
		const { stack, root } = harness;

		const adopt = go({ harness, to: "/", delta: -1 });

		expect(adopt).toBeTypeOf("function");
		expect(stack.covering).toBe(true);
		expect(stack.staged).toBe(ghost);
		expect(root.style.transform).toBe("");
		expect(stack.committing).toBe(false);
	});

	it("drops the picture only after two ticks and every landing hold", async () => {
		const { harness } = await landedBack();
		const { stack } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		const release = holdScreenLanding();

		adopt?.();
		await flushLanding();
		expect(stack.covering).toBe(true);

		release();
		await flushLanding();
		expect(stack.covering).toBe(false);
		expect(stack.staged).toBeNull();
		expect(stack.moving).toBe(false);
	});

	it("waits for the images in view to decode", async () => {
		const { harness } = await landedBack();
		const { stack, root } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		const image = document.createElement("img");
		image.getBoundingClientRect = () => rect({ top: 0 });
		let decoded!: () => void;
		image.decode = () =>
			new Promise<void>((resolve) => {
				decoded = resolve;
			});
		const offscreen = document.createElement("img");
		offscreen.getBoundingClientRect = () => rect({ top: innerHeight + 10 });
		offscreen.decode = () => new Promise<void>(() => {});
		root.append(image, offscreen);

		adopt?.();
		await flushLanding();
		expect(stack.covering).toBe(true);

		decoded();
		await flushLanding();
		expect(stack.covering).toBe(false);
	});

	it("waits for an image in view that still shows its placeholder to get its own picture and decode it", async () => {
		const { harness } = await landedBack();
		const { stack, root } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		const image = document.createElement("img");
		image.src = TRANSPARENT_PIXEL;
		image.getBoundingClientRect = () => rect({ top: 0 });
		let decoded!: () => void;
		image.decode = () =>
			image.getAttribute("src") === TRANSPARENT_PIXEL
				? Promise.resolve()
				: new Promise<void>((resolve) => {
						decoded = resolve;
					});
		root.append(image);

		adopt?.();
		await flushLanding();
		expect(stack.covering, "the placeholder is not the picture").toBe(true);

		image.src = "https://cdn.test/thumb.jpg";
		await flushLanding();
		expect(stack.covering, "the picture is still decoding").toBe(true);

		decoded();
		await flushLanding();
		expect(stack.covering).toBe(false);
	});

	it("drops the picture at the cap when an image in view keeps its placeholder", async () => {
		const { harness } = await landedBack();
		const { stack, root } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		const image = document.createElement("img");
		image.src = TRANSPARENT_PIXEL;
		image.getBoundingClientRect = () => rect({ top: 0 });
		image.decode = () => Promise.resolve();
		root.append(image);

		adopt?.();
		await flushLanding();
		vi.advanceTimersByTime(LANDING_CAP_MS);
		await flushLanding();

		expect(stack.covering).toBe(false);
	});

	it("refuses a swipe while the picture covers the screen it landed on, and offers the one behind that screen once it drops", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.spyOn(history, "back").mockImplementation(() => {});
		const harness = makeScreenStack({ at: "/" });
		go({ harness, to: "/profile/7", toRoute: PROFILE });
		const grid = harness.stack.staged;
		go({ harness, to: "/settings/profile", toRoute: EDIT_PROFILE });
		const profile = harness.stack.staged;
		await committed({ harness });
		const { stack } = harness;

		const adopt = go({ harness, to: "/profile/7", delta: -1 });
		expect(stack.covering).toBe(true);
		expect(stack.offersSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);
		expect(stack.tracking).toBe(false);
		expect(stack.staged).toBe(profile);

		adopt?.();
		await flushLanding();
		expect(stack.covering).toBe(false);
		expect(stack.staged).toBe(grid);
		expect(stack.offersSwipeBack).toBe(true);
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.staged).toBe(grid);
	});

	it("drops the picture at the cap when a hold is never released", async () => {
		const { harness } = await landedBack();
		const { stack } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		holdScreenLanding();

		adopt?.();
		await flushLanding();
		vi.advanceTimersByTime(LANDING_CAP_MS - 1);
		await flushLanding();
		expect(stack.covering).toBe(true);

		vi.advanceTimersByTime(1);
		await flushLanding();
		expect(stack.covering).toBe(false);
		expect(stack.staged).toBeNull();
	});

	it("takes no hold once the landing is under way", async () => {
		const { harness } = await landedBack();
		const { stack } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });

		adopt?.();
		holdScreenLanding();
		await flushLanding();

		expect(stack.covering).toBe(false);
	});

	it("drops the picture at once when another navigation starts during the landing", async () => {
		const { harness } = await landedBack();
		const { stack } = harness;
		const adopt = go({ harness, to: "/", delta: -1 });
		holdScreenLanding();
		adopt?.();

		go({ harness, to: "/right-now", toRoute: RIGHT_NOW });

		expect(stack.covering).toBe(false);
		expect(stack.staged).toBeNull();
	});
});
