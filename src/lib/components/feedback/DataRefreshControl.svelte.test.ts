// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
	BUTTON_REST_HEIGHT,
	distinctBands,
	distinctInsets,
	FRAME_MS,
	MIN_REFRESHING_MS,
	mountAtRest,
	outroEvents,
	STALE_KEY_MS,
	TWEEN_FRAMES,
	TWEEN_MS,
	useRefreshControlHarness,
} from "./refresh-control-test-harness";

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: reducedMotion,
}));

describe("the refresh control", () => {
	useRefreshControlHarness({ reducedMotion });

	it("shows the pull hint at the band's own height while the disc is still leaving", async () => {
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		await view.setUpdating(false);
		await view.startDiscOutro();
		expect(outroEvents).toEqual(["outrostart"]);

		await view.moveBandTo({ px: 6, pulledByWheel: true });

		expect(view.disc()).not.toBeNull();
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.band().style.height).toBe("6px");
		expect(Number(view.band().style.opacity)).toBeLessThan(1);

		await view.moveBandTo({ px: 9, pulledByWheel: true });
		expect(view.band().style.height).toBe("9px");

		await view.finishDiscOutro();
		expect(outroEvents).toEqual(["outrostart", "outroend"]);
		expect(view.disc()).toBeNull();
		expect(view.band().style.height).toBe("9px");
	});

	it("keeps the disc's window open and opaque between the end of a refresh and the disc leaving", async () => {
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		const whileRefreshing = view.discClipBoxes();

		await view.setUpdating(false);
		expect(outroEvents).toEqual([]);
		expect(view.disc()).not.toBeNull();
		expect(view.discClipBoxes()).toEqual(whileRefreshing);

		await view.wait(FRAME_MS);
		expect(outroEvents).toEqual([]);
		expect(view.discClipBoxes()).toEqual(whileRefreshing);

		await view.startDiscOutro();
		expect(outroEvents).toEqual(["outrostart"]);
		expect(view.disc()).not.toBeNull();
		expect(view.discClipBoxes()).toEqual(whileRefreshing);
	});

	it("opens no band space for a refresh that started elsewhere", async () => {
		const view = await mountAtRest("top");

		await view.setUpdating(true);
		const whileRefreshing = await view.contentFramesOver(TWEEN_FRAMES);
		await view.setUpdating(false);
		await view.startDiscOutro();
		await view.finishDiscOutro();
		const afterwards = await view.contentFramesOver(TWEEN_FRAMES);

		expect(outroEvents).toEqual(["outrostart", "outroend"]);
		expect(distinctBands(whileRefreshing)).toEqual(["0px"]);
		expect(distinctBands(afterwards)).toEqual(["0px"]);
	});

	it("puts the button back at its resting height while the disc of a clicked refresh is still leaving", async () => {
		const view = await mountAtRest("top");
		await view.wheelWithoutBand();
		await view.wait(TWEEN_MS);
		expect(view.band().style.height).toBe(BUTTON_REST_HEIGHT);

		view.button()!.click();
		await view.setUpdating(true);
		expect(view.disc()).not.toBeNull();
		expect(view.button()).toBeNull();

		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false);
		await view.startDiscOutro();

		expect(outroEvents).toEqual(["outrostart"]);
		expect(view.disc()).not.toBeNull();
		expect(view.button()).not.toBeNull();
		expect(view.band().style.height).toBe(BUTTON_REST_HEIGHT);
	});

	it("shows the pull hint and no button for a band that no wheel comes with", async () => {
		const view = await mountAtRest("top");

		await view.moveBandTo({ px: 6, pulledByWheel: false });

		expect(view.phase()).toBe("pulling");
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.button()).toBeNull();
		expect(view.contentInset()).toBe("0px");
	});

	it("offers the button instead of the pull hint for a band that a scroll key drives, and never refreshes", async () => {
		const view = await mountAtRest("top");
		const whileBanding: { phase?: string; bandText?: string }[] = [];
		await view.pressOutsideList("PageUp");

		for (const px of [6, 22]) {
			await view.moveBandTo({ px: px, pulledByWheel: false });
			whileBanding.push({
				phase: view.phase(),
				bandText: view.bandText(),
			});
		}
		await view.releaseBand();
		await view.wait(TWEEN_MS);

		expect(whileBanding).toEqual([
			{ phase: "idle", bandText: "Refresh" },
			{ phase: "idle", bandText: "Refresh" },
		]);
		expect(view.phase()).toBe("idle");
		expect(view.onrefresh).not.toHaveBeenCalled();
		expect(view.button()).not.toBeNull();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
	});

	it("goes back to the pull hint at the next band once the key press is stale", async () => {
		const view = await mountAtRest("top");
		await view.pressOutsideList("PageUp");
		await view.moveBandTo({ px: 6, pulledByWheel: false });
		await view.releaseBand();
		await view.wait(STALE_KEY_MS);
		expect(view.button()).not.toBeNull();

		await view.moveBandTo({ px: 6, pulledByWheel: false });

		expect(view.phase()).toBe("pulling");
		expect(view.bandText()).toBe("Pull to refresh");
		expect(view.button()).toBeNull();
	});

	it("offers the button for a key that scrolls toward the edge the list already rests at", async () => {
		const view = await mountAtRest("top");

		await view.pressInsideList("ArrowDown");
		const afterKeyIntoContent = await view.contentFramesOver(TWEEN_FRAMES);
		await view.pressInsideList("ArrowUp");
		await view.wait(TWEEN_MS);

		expect(distinctInsets(afterKeyIntoContent)).toEqual(["0px"]);
		expect(view.button()).not.toBeNull();
		expect(view.contentInset()).toBe(BUTTON_REST_HEIGHT);
	});
});
