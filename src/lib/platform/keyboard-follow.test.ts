import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "$lib/test/platform";
import type { KeyboardCurve, KeyboardMotion } from "./keyboard-follow";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

const NOW = 1_800_000_000_000;
const SCREEN_HEIGHT = 874;
const KEYBOARD = 328;
const TALLER_KEYBOARD = 372;
const SAFE_BOTTOM = 34;
const LIFT = KEYBOARD - SAFE_BOTTOM;
const DURATION = 400;
const SETTLE_MS = 150;
const LINEAR: KeyboardCurve = [0, 0, 1, 1];
const KEYBOARD_CURVE: KeyboardCurve = [0.296, 0.93, 0.287, 1];

type Module = typeof import("./keyboard-follow");

type Played = {
	offsets: number[];
	options: KeyframeAnimationOptions;
	animation: FakeAnimation;
};

class FakeAnimation extends EventTarget {
	startTime: number | null = null;
	cancel = vi.fn();

	finish() {
		this.dispatchEvent(new Event("finish"));
	}
}

let played: Played[];
let detachers: (() => void)[];
let keyboardFollow: Module;

function showing(overrides: Partial<KeyboardMotion> = {}): KeyboardMotion {
	return {
		from: 0,
		to: KEYBOARD,
		duration: DURATION,
		startedAt: NOW,
		curve: LINEAR,
		...overrides,
	};
}

function hiding(overrides: Partial<KeyboardMotion> = {}): KeyboardMotion {
	return showing({ from: KEYBOARD, to: 0, ...overrides });
}

function translation(keyframe: Keyframe): number {
	const match = /^translateY\((-?[\d.e-]+)px\)$/.exec(
		String(keyframe.transform),
	);
	if (!match) throw new Error(`unexpected keyframe ${keyframe.transform}`);
	return Number(match[1]);
}

function follower(): HTMLElement {
	const host = document.createElement("div");
	vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 402, SCREEN_HEIGHT - SAFE_BOTTOM),
	);
	const element = document.createElement("div");
	const composer = document.createElement("textarea");
	element.append(composer);
	host.append(element);
	document.body.append(host);
	vi.spyOn(element, "animate").mockImplementation((keyframes, options) => {
		const animation = new FakeAnimation();
		played.push({
			offsets: (keyframes as Keyframe[]).map(translation),
			options: options as KeyframeAnimationOptions,
			animation,
		});
		return animation as unknown as Animation;
	});
	return element;
}

function attach(element: HTMLElement): () => void {
	const detach = keyboardFollow.followSoftKeyboard(element);
	if (!detach) throw new Error("nothing was attached");
	detachers.push(detach);
	return () => {
		detachers = detachers.filter((other) => other !== detach);
		detach();
	};
}

async function follow(...elements: HTMLElement[]) {
	vi.resetModules();
	keyboardFollow = await import("./keyboard-follow");
	for (const element of elements) attach(element);
}

function move(motion: KeyboardMotion) {
	window.__iosKeyboardMotion?.(motion);
}

function last(): Played {
	const latest = played.at(-1);
	if (!latest) throw new Error("nothing was animated");
	return latest;
}

function lifted(element: HTMLElement): string {
	return element.style.marginBottom;
}

function followRequests(): unknown[] {
	return invokeMock.mock.calls
		.filter(([command]) => command === "set_keyboard_follow")
		.map(([, args]) => args);
}

function focus(element: HTMLElement, relatedTarget: Element | null = null) {
	element.dispatchEvent(
		new FocusEvent("focusin", { bubbles: true, relatedTarget }),
	);
}

function blur(element: HTMLElement, relatedTarget: Element | null = null) {
	element.dispatchEvent(
		new FocusEvent("focusout", { bubbles: true, relatedTarget }),
	);
}

function closed(): { done: () => boolean; waiting: boolean } {
	const wait = keyboardFollow.followedKeyboardClosed({ settleMs: SETTLE_MS });
	let resolved = false;
	void wait?.then(() => {
		resolved = true;
	});
	return { done: () => resolved, waiting: wait !== undefined };
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	played = [];
	detachers = [];
	invokeMock.mockReset();
	invokeMock.mockResolvedValue(undefined);
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
	vi.setSystemTime(NOW);
	vi.stubGlobal("innerHeight", SCREEN_HEIGHT);
});

afterEach(() => {
	for (const detach of detachers) detach();
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	resetPlatform();
});

describe("on ios", () => {
	beforeEach(() => {
		runningOn("ios");
	});

	it("hands the keyboard to the page while a follower is attached", async () => {
		await follow();
		const detach = attach(follower());

		expect(followRequests()).toEqual([{ follow: true }]);

		detach();
		await flush();

		expect(followRequests()).toEqual([{ follow: true }, { follow: false }]);
		expect(window.__iosKeyboardMotion).toBeUndefined();
	});

	it("holds still until the keyboard passes the safe area, then rides on it", async () => {
		const element = follower();
		await follow(element);

		move(showing());

		const { offsets, options } = last();
		expect(offsets[0]).toBe(0);
		expect(offsets[3]).toBe(0);
		expect(offsets[16]).toBeCloseTo(-(KEYBOARD / 2 - SAFE_BOTTOM));
		expect(offsets.at(-1)).toBeCloseTo(-LIFT);
		expect(options).toMatchObject({
			duration: DURATION,
			easing: "linear",
			fill: "both",
		});
		expect(lifted(element)).toBe("");
	});

	it("follows the keyboard's own timing curve", async () => {
		await follow(follower());

		move(showing({ curve: KEYBOARD_CURVE }));

		expect(last().offsets[16]).toBeCloseTo(
			-(KEYBOARD * 0.951299 - SAFE_BOTTOM),
			2,
		);
	});

	it("joins a keyboard that started moving before the page heard of it", async () => {
		await follow(follower());
		vi.spyOn(performance, "now").mockReturnValue(5_000);

		move(showing({ startedAt: NOW - 120 }));

		expect(last().animation.startTime).toBe(5_000 - 120);
	});

	it("waits for a keyboard that starts moving after the push", async () => {
		await follow(follower());
		vi.spyOn(performance, "now").mockReturnValue(5_000);

		move(showing({ startedAt: NOW + 20 }));

		expect(last().animation.startTime).toBe(5_000 + 20);
	});

	it("lays the follower out above the keyboard in the frame the ride ends", async () => {
		const element = follower();
		await follow(element);
		move(showing());
		const { animation } = last();
		let liftWhenCancelled = "";
		animation.cancel.mockImplementation(() => {
			liftWhenCancelled = lifted(element);
		});

		animation.finish();

		expect(animation.cancel).toHaveBeenCalledOnce();
		expect(liftWhenCancelled).toBe(`${LIFT}px`);
		expect(lifted(element)).toBe(`${LIFT}px`);
	});

	it("drops the layout and starts the ride down from the old place in one step", async () => {
		const element = follower();
		await follow(element);
		move(showing());
		last().animation.finish();
		vi.setSystemTime(NOW + DURATION);

		move(hiding({ startedAt: NOW + DURATION }));

		const { offsets, options } = last();
		expect(lifted(element)).toBe("");
		expect(offsets[0]).toBeCloseTo(-LIFT);
		expect(offsets.at(-1)).toBe(0);
		expect(options.fill).toBe("both");
		last().animation.finish();
		expect(lifted(element)).toBe("");
	});

	it("rides up from the laid out place when the keyboard grows", async () => {
		const element = follower();
		await follow(element);
		move(showing({ duration: 0 }));

		move(showing({ from: KEYBOARD, to: TALLER_KEYBOARD }));

		const { offsets } = last();
		expect(lifted(element)).toBe(`${LIFT}px`);
		expect(offsets[0]).toBe(0);
		expect(offsets.at(-1)).toBeCloseTo(-(TALLER_KEYBOARD - KEYBOARD));
		last().animation.finish();
		expect(lifted(element)).toBe(`${TALLER_KEYBOARD - SAFE_BOTTOM}px`);
	});

	it("lays out for a shorter keyboard at once and rides down to it", async () => {
		const element = follower();
		await follow(element);
		move(showing({ to: TALLER_KEYBOARD, duration: 0 }));

		move(showing({ from: TALLER_KEYBOARD, to: KEYBOARD }));

		const { offsets } = last();
		expect(lifted(element)).toBe(`${LIFT}px`);
		expect(offsets[0]).toBeCloseTo(-(TALLER_KEYBOARD - KEYBOARD));
		expect(offsets.at(-1)).toBe(0);
	});

	it("lays a keyboard that is already up out without a ride", async () => {
		const element = follower();
		await follow(element);

		move(showing({ from: KEYBOARD, duration: 0 }));

		expect(played).toHaveLength(0);
		expect(lifted(element)).toBe(`${LIFT}px`);
	});

	it("turns back from where it is when the keyboard reverses mid-way", async () => {
		const element = follower();
		await follow(element);
		move(showing());
		const shown = last();

		vi.setSystemTime(NOW + DURATION / 2);
		move(hiding({ startedAt: NOW + DURATION / 2 }));

		expect(shown.animation.cancel).toHaveBeenCalled();
		const { offsets } = last();
		expect(offsets[0]).toBeCloseTo(-(KEYBOARD / 2 - SAFE_BOTTOM));
		expect(offsets.at(-1)).toBe(0);
		expect(lifted(element)).toBe("");
	});

	it("ignores the end of a ride that a newer motion replaced", async () => {
		const element = follower();
		await follow(element);
		move(showing());
		const shown = last();
		vi.setSystemTime(NOW + DURATION / 2);
		move(hiding({ startedAt: NOW + DURATION / 2 }));

		shown.animation.finish();

		expect(lifted(element)).toBe("");
	});

	it("measures the room under its host instead of assuming the safe area", async () => {
		const element = follower();
		const host = element.parentElement as HTMLElement;
		vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 0, 402, SCREEN_HEIGHT - 100),
		);
		await follow(element);

		move(showing({ duration: 0 }));

		expect(lifted(element)).toBe(`${KEYBOARD - 100}px`);
	});

	it("moves every follower together", async () => {
		const first = follower();
		const second = follower();
		await follow(first, second);

		move(showing());

		expect(played).toHaveLength(2);
		expect(played[0]?.offsets).toEqual(played[1]?.offsets);
	});

	it("places a follower that attaches while the keyboard is up", async () => {
		const first = follower();
		await follow(first);
		move(showing({ duration: 0 }));
		const second = follower();

		attach(second);

		expect(lifted(second)).toBe(`${LIFT}px`);
		expect(followRequests()).toEqual([{ follow: true }]);
	});

	it("keeps following when a conversation is swapped for another in one task", async () => {
		await follow();
		const detach = attach(follower());
		move(showing({ duration: 0 }));
		const next = follower();

		detach();
		attach(next);
		await flush();

		expect(followRequests()).toEqual([{ follow: true }]);
		expect(lifted(next)).toBe(`${LIFT}px`);
		expect(window.__iosKeyboardMotion).toBeDefined();
	});

	it("starts over after the last follower is gone", async () => {
		await follow();
		const detach = attach(follower());
		move(showing({ duration: 0 }));
		detach();
		await flush();
		const next = follower();

		attach(next);

		expect(followRequests()).toEqual([
			{ follow: true },
			{ follow: false },
			{ follow: true },
		]);
		expect(lifted(next)).toBe("");
	});

	it("comes back to rest when it detaches", async () => {
		const element = follower();
		await follow();
		const detach = attach(element);
		move(showing());
		const { animation } = last();

		detach();

		expect(animation.cancel).toHaveBeenCalled();
		expect(lifted(element)).toBe("");
	});

	it("gives the keyboard back to the frame while a field outside the follower has focus", async () => {
		const element = follower();
		await follow(element);
		move(showing({ duration: 0 }));
		const search = document.createElement("input");
		document.body.append(search);

		focus(search);

		expect(followRequests().at(-1)).toEqual({ follow: false });
		expect(lifted(element)).toBe("");
		move(hiding());
		expect(played).toHaveLength(0);

		blur(search);

		expect(followRequests().at(-1)).toEqual({ follow: true });
	});

	it("keeps the keyboard with the page while focus moves inside the follower", async () => {
		const element = follower();
		await follow(element);
		const composer = element.querySelector("textarea") as HTMLElement;

		focus(composer);
		blur(composer);

		expect(followRequests()).toEqual([{ follow: true }]);
	});

	it("waits for the next field when focus moves between fields outside the follower", async () => {
		await follow(follower());
		const first = document.createElement("input");
		const second = document.createElement("input");
		document.body.append(first, second);
		focus(first);

		blur(first, second);
		focus(second, first);

		expect(followRequests()).toEqual([{ follow: true }, { follow: false }]);
	});

	it("ignores focus on controls that raise no keyboard", async () => {
		await follow(follower());
		const button = document.createElement("button");
		document.body.append(button);

		focus(button);

		expect(followRequests()).toEqual([{ follow: true }]);
	});

	describe("the close a stack waits for before it slides", () => {
		it("is moving only while a ride runs", async () => {
			await follow(follower());
			expect(keyboardFollow.followedKeyboardMoving()).toBe(false);

			move(hiding());
			expect(keyboardFollow.followedKeyboardMoving()).toBe(true);

			vi.setSystemTime(NOW + DURATION);
			expect(keyboardFollow.followedKeyboardMoving()).toBe(false);
		});

		it("ends when the ride down ends, not before", async () => {
			await follow(follower());
			move(showing({ duration: 0 }));
			move(hiding());

			const wait = closed();
			vi.advanceTimersByTime(DURATION - 1);
			await flush();
			expect(wait.done()).toBe(false);

			last().animation.finish();
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("waits for a close that the native side reports after Back", async () => {
			await follow(follower());
			move(showing({ duration: 0 }));

			const wait = closed();
			vi.advanceTimersByTime(SETTLE_MS - 10);
			move(hiding({ startedAt: Date.now() }));
			vi.advanceTimersByTime(SETTLE_MS);
			await flush();
			expect(wait.done()).toBe(false);

			last().animation.finish();
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("gives up when no close comes", async () => {
			await follow(follower());
			move(showing({ duration: 0 }));

			const wait = closed();
			vi.advanceTimersByTime(SETTLE_MS - 1);
			await flush();
			expect(wait.done()).toBe(false);

			vi.advanceTimersByTime(1);
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("does not outlast a ride whose end never comes", async () => {
			await follow(follower());
			move(showing({ duration: 0 }));
			move(hiding());

			const wait = closed();
			vi.advanceTimersByTime(DURATION + SETTLE_MS);
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("is over at once when the keyboard is already down", async () => {
			await follow(follower());
			move(showing({ duration: 0 }));
			move(hiding({ duration: 0 }));

			const wait = closed();
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("ends when the page stops following", async () => {
			const element = follower();
			await follow();
			const detach = attach(element);
			move(showing({ duration: 0 }));
			move(hiding());
			const wait = closed();

			detach();
			await flush();

			expect(wait.done()).toBe(true);
		});

		it("is left to the resize while the page does not follow", async () => {
			await follow();

			expect(closed().waiting).toBe(false);
			expect(keyboardFollow.followedKeyboardMoving()).toBe(false);
		});
	});
});

describe.each(["android", "linux", "macos", "windows"] as const)(
	"on %s",
	(platform) => {
		it("leaves the keyboard to the resized page", async () => {
			runningOn(platform);
			vi.resetModules();
			keyboardFollow = await import("./keyboard-follow");
			const element = follower();

			expect(keyboardFollow.followSoftKeyboard(element)).toBeUndefined();
			move(showing());

			expect(window.__iosKeyboardMotion).toBeUndefined();
			expect(invokeMock).not.toHaveBeenCalled();
			expect(played).toHaveLength(0);
			expect(closed().waiting).toBe(false);
		});
	},
);
