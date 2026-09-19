import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	restoreScrollOnce,
	type ScrollableListState,
} from "./scroll-restore.svelte";

class ListState implements ScrollableListState {
	loading = $state(false);
	error: Error | null = $state(null);
	scrollY = 0;
}

type ResolveTop = NonNullable<
	Parameters<typeof restoreScrollOnce>[0]["resolveTop"]
>;

function restoring({
	scrollY,
	resolveTop,
}: {
	scrollY: number;
	resolveTop: ResolveTop;
}) {
	const scroller = document.createElement("div");
	document.body.append(scroller);
	const list = new ListState();
	list.scrollY = scrollY;
	const stop = $effect.root(() => {
		restoreScrollOnce({
			container: () => scroller,
			state: list,
			resolveTop,
		});
	});
	flushSync();
	return { scroller, list, stop };
}

let stopRestoring: (() => void) | undefined;

afterEach(() => {
	stopRestoring?.();
	stopRestoring = undefined;
	document.body.replaceChildren();
});

describe("restoreScrollOnce", () => {
	it("resolves the offset after the next tick from the one saved when the list was ready", async () => {
		const resolveTop = vi.fn<ResolveTop>(() => 3000);
		const { scroller, list, stop } = restoring({
			scrollY: 1200,
			resolveTop,
		});
		stopRestoring = stop;

		expect(resolveTop).not.toHaveBeenCalled();

		list.scrollY = 50;
		await tick();

		expect(resolveTop).toHaveBeenCalledExactlyOnceWith({
			scroller,
			savedTop: 1200,
		});
		expect(scroller.scrollTop).toBe(3000);
	});

	it("scrolls to a resolved offset even when none was saved", async () => {
		const { scroller, stop } = restoring({
			scrollY: 0,
			resolveTop: () => 640,
		});
		stopRestoring = stop;

		await tick();

		expect(scroller.scrollTop).toBe(640);
	});

	it("neither resolves nor scrolls once torn down before the tick", async () => {
		const resolveTop = vi.fn<ResolveTop>(() => 3000);
		const { scroller, stop } = restoring({ scrollY: 1200, resolveTop });

		stop();
		await tick();

		expect(resolveTop).not.toHaveBeenCalled();
		expect(scroller.scrollTop).toBe(0);
	});

	it("restores once, after a reload that starts before the tick", async () => {
		const resolveTop = vi.fn<ResolveTop>(() => 3000);
		const { scroller, list, stop } = restoring({
			scrollY: 1200,
			resolveTop,
		});
		stopRestoring = stop;

		list.loading = true;
		flushSync();
		await tick();

		expect(resolveTop).not.toHaveBeenCalled();

		list.loading = false;
		flushSync();
		await tick();

		expect(resolveTop).toHaveBeenCalledOnce();
		expect(scroller.scrollTop).toBe(3000);
	});
});
