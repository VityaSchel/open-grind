import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	announceSafeAreaChange,
	safeArea,
	type SafeAreaSide,
} from "./safe-area";

let stopReading: (() => void) | null = null;

function setInset(side: SafeAreaSide, px: number) {
	document.documentElement.style.setProperty(
		`--safe-area-${side}`,
		`${px}px`,
	);
}

function readInEffect() {
	const reads: Record<SafeAreaSide, number>[] = [];
	stopReading = $effect.root(() => {
		$effect(() => {
			reads.push(safeArea.current);
		});
	});
	flushSync();
	return reads;
}

afterEach(() => {
	stopReading?.();
	stopReading = null;
	document.documentElement.removeAttribute("style");
});

describe("the safe area reader", () => {
	it("rereads the insets when the native side announces new ones", () => {
		const reads = readInEffect();

		setInset("left", 62);
		setInset("right", 62);
		announceSafeAreaChange();
		flushSync();

		expect(reads).toEqual([
			{ top: 0, right: 0, bottom: 0, left: 0 },
			{ top: 0, right: 62, bottom: 0, left: 62 },
		]);
	});

	it("rereads the insets when the window resizes without an announcement", () => {
		const reads = readInEffect();

		setInset("bottom", 20);
		window.dispatchEvent(new Event("resize"));
		flushSync();

		expect(reads.at(-1)).toEqual({ top: 0, right: 0, bottom: 20, left: 0 });
	});
});
