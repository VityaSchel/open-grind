import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { slots } = vi.hoisted(() => ({
	slots: {
		released: 0,
		grantNow: true,
		pending: [] as (() => void)[],
		settledLater: [] as unknown[],
	},
}));

vi.mock("$lib/util/media-load-slots", () => ({
	acquireMediaLoadSlot(grant: () => void) {
		if (slots.grantNow) grant();
		else slots.pending.push(grant);
		return () => slots.released++;
	},
	releaseWhenSettled({ image }: { image: unknown }) {
		slots.settledLater.push(image);
	},
}));

import { probeMedia } from "./media-probe";

class FakeImage {
	static made: FakeImage[] = [];
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	src = "";
	naturalWidth = 0;
	complete = false;
	constructor() {
		FakeImage.made.push(this);
	}
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	vi.stubGlobal("Image", FakeImage);
	FakeImage.made = [];
	Object.assign(slots, {
		released: 0,
		grantNow: true,
		pending: [],
		settledLater: [],
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const probe = (signal = new AbortController().signal) =>
	probeMedia({ src: "http://ogmedia.localhost/iX?retry=2", signal });

describe("probeMedia", () => {
	it("hands over its slot once the photo has loaded", async () => {
		const result = probe();
		const image = FakeImage.made[0]!;
		expect(image.src).toBe("http://ogmedia.localhost/iX?retry=2");
		image.naturalWidth = 320;
		image.onload?.();

		const slot = await result;
		expect(slots.released).toBe(0);
		slot?.();
		expect(slots.released).toBe(1);
	});

	it("answers no for an error, an empty image or a load that never ends", async () => {
		const errored = probe();
		FakeImage.made[0]!.onerror?.();
		const empty = probe();
		FakeImage.made[1]!.onload?.();
		const stuck = probe();
		await vi.advanceTimersByTimeAsync(30_000);

		await expect(errored).resolves.toBeNull();
		await expect(empty).resolves.toBeNull();
		await expect(stuck).resolves.toBeNull();
		expect(slots.released).toBe(3);
	});

	it("waits for a load slot before it requests anything", async () => {
		slots.grantNow = false;
		const result = probe();
		expect(FakeImage.made).toHaveLength(0);

		slots.pending[0]!();
		FakeImage.made[0]!.onerror?.();

		await expect(result).resolves.toBeNull();
	});

	it("keeps the slot of an aborted load until that load settles", async () => {
		const controller = new AbortController();
		const result = probe(controller.signal);

		controller.abort();

		await expect(result).resolves.toBeNull();
		expect(slots.released).toBe(0);
		expect(slots.settledLater).toEqual([FakeImage.made[0]]);
	});

	it("stops when aborted and never starts a load it no longer needs", async () => {
		slots.grantNow = false;
		const controller = new AbortController();
		const result = probe(controller.signal);

		controller.abort();
		slots.pending[0]!();

		await expect(result).resolves.toBeNull();
		expect(FakeImage.made).toHaveLength(0);
		expect(slots.released).toBe(1);
	});
});
