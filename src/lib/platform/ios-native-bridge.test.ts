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

import { holdTouch } from "#lib/platform/held-touch.ts";
import { pointerEvent } from "#lib/test/pointer.ts";
import { IosSystemBack } from "./ios-native-bridge";
import type { SystemBackGesture } from "./system-back-gesture.svelte";

class FakePointerEvent extends MouseEvent {
	readonly pointerId: number;
	readonly pointerType: string;
	readonly isPrimary: boolean;

	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerId = init.pointerId ?? 0;
		this.pointerType = init.pointerType ?? "";
		this.isPrimary = init.isPrimary ?? false;
	}
}

function makeGesture({ starts = true }: { starts?: boolean } = {}) {
	const undo = vi.fn();
	const gesture = {
		start: vi.fn(() => starts),
		cancel: vi.fn(),
		finish: vi.fn(),
		prepare: vi.fn(() => undo),
	} satisfies SystemBackGesture;
	return { gesture, undo };
}

function touchDown(target: Element) {
	const event = pointerEvent("pointerdown");
	Object.defineProperty(event, "isPrimary", { value: true });
	target.dispatchEvent(event);
}

function sentArms() {
	vi.runOnlyPendingTimers();
	return invoke.mock.calls.map(
		([, args]) => args as { armed: boolean; order: number },
	);
}

const sentArmed = () => sentArms().map(({ armed }) => armed);

let row: HTMLElement;
let systemBack: IosSystemBack;

beforeEach(() => {
	vi.stubGlobal("PointerEvent", FakePointerEvent);
	row = document.createElement("div");
	document.body.append(row);
	document.elementFromPoint = () => row;
	systemBack = new IosSystemBack();
	systemBack.install();
});

afterEach(() => {
	row.remove();
	delete window.__iosBack;
	invoke.mockClear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const start = () => window.__iosBack?.start({ x: 2, y: 300 });

describe("IosSystemBack arming", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
	});

	it("tells native only when the arm changes, in increasing order", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);

		systemBack.arm({ gesture, armed: false });
		expect(sentArmed()).toEqual([]);
		systemBack.arm({ gesture, armed: true });
		expect(sentArmed()).toEqual([true]);
		systemBack.arm({ gesture, armed: true });
		systemBack.arm({ gesture, armed: false });

		const pushes = sentArms();
		expect(invoke).toHaveBeenCalledWith("set_back_swipe_armed", {
			armed: true,
			order: expect.any(Number),
		});
		expect(pushes.map(({ armed }) => armed)).toEqual([true, false]);
		expect(pushes[1]!.order).toBeGreaterThan(pushes[0]!.order);
	});

	it("sends nothing for an arm that flips back within the same task", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		systemBack.arm({ gesture, armed: true });
		expect(sentArmed()).toEqual([true]);

		systemBack.arm({ gesture, armed: false });
		systemBack.arm({ gesture, armed: true });

		expect(sentArmed()).toEqual([true]);
	});

	it("ignores a stack that is no longer the one exposed", () => {
		const old = makeGesture().gesture;
		const unexposeOld = systemBack.expose(old);
		const current = makeGesture().gesture;
		systemBack.expose(current);
		systemBack.arm({ gesture: current, armed: true });
		expect(sentArmed()).toEqual([true]);

		systemBack.arm({ gesture: old, armed: false });
		unexposeOld();

		expect(sentArmed()).toEqual([true]);
	});

	it("disarms when the exposed stack goes away", () => {
		const { gesture } = makeGesture();
		const unexpose = systemBack.expose(gesture);
		systemBack.arm({ gesture, armed: true });
		expect(sentArmed()).toEqual([true]);

		unexpose();

		expect(sentArmed()).toEqual([true, false]);
		expect(start()).toBe(false);
	});

	it("orders a page's arms after every arm of the page it replaced", () => {
		const { gesture } = makeGesture();
		const previous = new IosSystemBack();
		previous.expose(gesture);
		for (const armed of [true, false, true]) {
			previous.arm({ gesture, armed });
			vi.runOnlyPendingTimers();
		}
		vi.advanceTimersByTime(1);
		const reloaded = new IosSystemBack();
		reloaded.expose(gesture);
		reloaded.arm({ gesture, armed: true });

		const orders = sentArms().map(({ order }) => order);
		expect(orders).toHaveLength(4);
		expect(orders.at(-1)).toBeGreaterThan(Math.max(...orders.slice(0, -1)));
	});
});

describe("IosSystemBack start", () => {
	it("starts the stack and cancels the page's own gesture under the finger", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		const cancelled = vi.fn();
		row.addEventListener("pointercancel", cancelled);
		touchDown(row);

		expect(start()).toBe(true);

		expect(gesture.start).toHaveBeenCalledOnce();
		expect(cancelled).toHaveBeenCalledOnce();
		expect(cancelled.mock.calls[0]![0]).toMatchObject({
			pointerId: 1,
			pointerType: "touch",
			bubbles: true,
		});
	});

	it("leaves the page's gesture alone when the stack refuses", () => {
		const { gesture } = makeGesture({ starts: false });
		systemBack.expose(gesture);
		const cancelled = vi.fn();
		row.addEventListener("pointercancel", cancelled);
		touchDown(row);

		expect(start()).toBe(false);
		expect(cancelled).not.toHaveBeenCalled();
	});

	it("leaves a touch that started on a touch-action: none control to it", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		const thumb = document.createElement("span");
		row.append(thumb);
		const style = getComputedStyle;
		vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
			element === row
				? ({ touchAction: "none" } as CSSStyleDeclaration)
				: style(element),
		);
		touchDown(thumb);

		expect(start()).toBe(false);
		expect(gesture.start).not.toHaveBeenCalled();
	});

	it("checks the point native reports when no touch was seen landing", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			touchAction: "none",
		} as CSSStyleDeclaration);

		expect(start()).toBe(false);
	});

	it("leaves a touch that a page gesture holds to it", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		const release = holdTouch();

		expect(start()).toBe(false);
		release();
		expect(start()).toBe(true);
	});

	it("forgets a touch once it lifts", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		const cancelled = vi.fn();
		row.addEventListener("pointercancel", cancelled);
		touchDown(row);
		row.dispatchEvent(pointerEvent("pointerup"));

		expect(start()).toBe(true);
		expect(cancelled).not.toHaveBeenCalled();
	});
});

describe("IosSystemBack progress and release", () => {
	it("hands the latest progress to the frame reader until the release", () => {
		const { gesture } = makeGesture();
		systemBack.expose(gesture);
		start();

		window.__iosBack?.progress(0.3);
		window.__iosBack?.progress(0.4);
		expect(systemBack.readProgress()).toBe(0.4);

		window.__iosBack?.finish({ commit: true, velocity: 1.2 });
		expect(systemBack.readProgress()).toBeUndefined();
		expect(gesture.finish).toHaveBeenCalledWith({
			commit: true,
			velocity: 1.2,
		});
	});
});

describe("IosSystemBack prepare", () => {
	it("undoes the stack's preparation when the touch lifts", () => {
		const { gesture, undo } = makeGesture();
		systemBack.expose(gesture);

		window.__iosBack?.prepare();
		expect(gesture.prepare).toHaveBeenCalledOnce();
		window.dispatchEvent(new Event("touchend"));
		window.dispatchEvent(new Event("touchcancel"));

		expect(undo).toHaveBeenCalledOnce();
	});

	it("undoes it after a second when no lift arrives", () => {
		vi.useFakeTimers();
		const { gesture, undo } = makeGesture();
		systemBack.expose(gesture);

		window.__iosBack?.prepare();
		vi.advanceTimersByTime(999);
		expect(undo).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(undo).toHaveBeenCalledOnce();

		window.dispatchEvent(new Event("touchend"));
		expect(undo).toHaveBeenCalledOnce();
	});

	it("does nothing without a stack", () => {
		window.__iosBack?.prepare();
		window.dispatchEvent(new Event("touchend"));

		expect(invoke).not.toHaveBeenCalled();
	});
});
