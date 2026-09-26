import { beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

import { PullModel } from "./pull-model.svelte";

function makeModel({
	space = 48,
	now = () => 0,
}: { space?: number; now?: () => number } = {}) {
	const model = new PullModel({ now });
	model.space = space;
	const onTrigger = vi.fn();
	model.onTrigger = onTrigger;
	return { model, onTrigger };
}

describe("PullModel", () => {
	it("starts idle with no display", () => {
		const { model } = makeModel();
		expect(model.phase).toBe("idle");
		expect(model.displayPx).toBe(0);
		expect(model.gestureActive).toBe(false);
	});

	it("claims a gesture and applies resistance to raw pull", () => {
		const { model } = makeModel();
		expect(model.beginPull("touch")).toBe(true);
		expect(model.phase).toBe("pulling");
		model.updatePull(48);
		expect(model.displayPx).toBeGreaterThan(0);
		expect(model.displayPx).toBeLessThan(48);
		expect(model.phase).toBe("pulling");
	});

	it("arms past the threshold and caps display at the overshoot", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(110);
		expect(model.phase).toBe("armed");
		model.updatePull(100000);
		expect(model.displayPx).toBeLessThanOrEqual(48 * 1.5);
	});

	it("stretches from a revealed baseline without hair-triggering", () => {
		const { model } = makeModel();
		model.getBaseline = () => 48;
		model.beginPull("touch");
		expect(model.displayPx).toBe(48);
		model.updatePull(30);
		expect(model.displayPx).toBeGreaterThan(48);
		expect(model.phase).toBe("pulling");
		model.updatePull(110);
		expect(model.phase).toBe("armed");
	});

	it("passes pre-resisted pull through unchanged", () => {
		const { model } = makeModel();
		model.beginPull("overscroll");
		model.updatePull(30, { preResisted: true });
		expect(model.displayPx).toBe(30);
		model.updatePull(60, { preResisted: true });
		expect(model.phase).toBe("armed");
	});

	it("never arms while space is unmeasured", () => {
		const { model } = makeModel({ space: 0 });
		model.beginPull("touch");
		model.updatePull(100000);
		expect(model.phase).toBe("pulling");
	});

	it("release below threshold cancels without triggering", () => {
		const { model, onTrigger } = makeModel();
		model.beginPull("touch");
		model.updatePull(20);
		model.release();
		expect(model.phase).toBe("idle");
		expect(model.displayPx).toBe(0);
		expect(model.settledFrom).toBe("touch");
		expect(model.settledOutcome).toBe("canceled");
		expect(onTrigger).not.toHaveBeenCalled();
	});

	it("release when armed fires the trigger", () => {
		const { model, onTrigger } = makeModel();
		model.beginPull("touch");
		model.updatePull(200);
		model.release();
		expect(model.phase).toBe("refreshing");
		expect(model.settledFrom).toBe("touch");
		expect(model.settledOutcome).toBe("triggered");
		expect(onTrigger).toHaveBeenCalledOnce();
	});

	it("trigger fires regardless of armed state", () => {
		const { model, onTrigger } = makeModel();
		model.beginPull("overscroll");
		model.updatePull(10);
		model.trigger();
		expect(model.phase).toBe("refreshing");
		expect(onTrigger).toHaveBeenCalledOnce();
	});

	it("refuses new gestures while refreshing or updating", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(200);
		model.release();
		expect(model.beginPull("touch")).toBe(false);
		model.finishRefresh();
		model.setUpdating(true);
		expect(model.beginPull("overscroll")).toBe(false);
		model.setUpdating(false);
		expect(model.beginPull("overscroll")).toBe(true);
	});

	it("refuses concurrent claims", () => {
		const { model } = makeModel();
		expect(model.beginPull("touch")).toBe(true);
		expect(model.beginPull("overscroll")).toBe(false);
	});

	it("clickTrigger fires from rest only", () => {
		const { model, onTrigger } = makeModel();
		model.clickTrigger();
		expect(model.phase).toBe("refreshing");
		expect(model.settledFrom).toBe("click");
		expect(onTrigger).toHaveBeenCalledOnce();
		model.clickTrigger();
		expect(onTrigger).toHaveBeenCalledOnce();
	});

	it("enforces a minimum refreshing duration", () => {
		let time = 0;
		const { model } = makeModel({ now: () => time });
		model.beginPull("touch");
		model.updatePull(200);
		model.release();
		expect(model.remainingRefreshMs()).toBe(500);
		time = 200;
		expect(model.remainingRefreshMs()).toBe(300);
		time = 900;
		expect(model.remainingRefreshMs()).toBe(0);
		model.finishRefresh();
		expect(model.phase).toBe("idle");
	});

	it("ignores stray updates and releases while idle", () => {
		const { model, onTrigger } = makeModel();
		model.updatePull(100);
		expect(model.displayPx).toBe(0);
		model.release();
		model.trigger();
		model.cancel();
		expect(model.phase).toBe("idle");
		expect(onTrigger).not.toHaveBeenCalled();
	});
});

describe("PullModel haptics", () => {
	beforeEach(() => {
		playHapticMock.mockReset();
	});

	it("taps once as a touch pull arms, however far it goes past", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(60);
		expect(playHapticMock).not.toHaveBeenCalled();
		model.updatePull(110);
		model.updatePull(200);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("threshold");
	});

	it("taps as a pre-resisted overscroll pull reaches the space", () => {
		const { model } = makeModel();
		model.beginPull("overscroll");
		model.updatePull(30, { preResisted: true });
		model.updatePull(48, { preResisted: true });
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("threshold");
	});

	it("stays quiet when a pull that armed dips back and arms again", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(110);
		model.updatePull(60);
		model.updatePull(110);
		expect(playHapticMock).toHaveBeenCalledOnce();
	});

	it("taps again once a pull has gone all the way back and returns", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(110);
		model.updatePull(0);
		model.updatePull(110);
		expect(playHapticMock).toHaveBeenCalledTimes(2);
	});

	it("taps once for each new pull", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(110);
		model.cancel();
		model.beginPull("touch");
		model.updatePull(110);
		expect(playHapticMock).toHaveBeenCalledTimes(2);
	});

	it("stays quiet for a pull that never arms", () => {
		const { model } = makeModel();
		model.beginPull("touch");
		model.updatePull(60);
		model.release();
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet for a refresh started by a click", () => {
		const { model } = makeModel();
		model.clickTrigger();
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});
