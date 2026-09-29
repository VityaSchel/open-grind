// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const failures = vi.hoisted(() => ({
	explainsMediaFailures: vi.fn(() => true),
	mediaFailure: vi.fn(),
}));

const { probeMediaMock, slotRequests } = vi.hoisted(() => ({
	probeMediaMock: vi.fn(),
	slotRequests: { count: 0 },
}));
vi.mock("$lib/util/media-probe", () => ({ probeMedia: probeMediaMock }));
vi.mock("$lib/util/media-load-slots", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("$lib/util/media-load-slots")>();
	return {
		...actual,
		acquireMediaLoadSlot: (grant: () => void) => {
			slotRequests.count++;
			return actual.acquireMediaLoadSlot(grant);
		},
	};
});

vi.mock("$lib/platform/media-failure", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-failure")>()),
	...failures,
}));

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
import { mediaRetry } from "$lib/util/media-retry.svelte";
import MediaImage from "./MediaImage.svelte";

const BROKEN = '[data-slot="broken-media"]';
const SRC = "http://ogmedia.localhost/iPAYLOAD";

const failure = (overrides: Record<string, unknown>) => ({
	kind: "status",
	status: null,
	host: "d3.cloudfront.net",
	signatureExpired: false,
	...overrides,
});

function renderImage({
	onexpired = vi.fn(() => Promise.resolve()),
	onload = vi.fn(),
}: { onexpired?: () => Promise<void>; onload?: () => void } = {}) {
	const { container, rerender } = render(MediaImage, {
		props: { src: SRC, onexpired, onload },
	});
	const image = () => container.querySelector("img");
	const broken = () => container.querySelector(BROKEN);
	const renew = (src: string) => rerender({ src });
	return { image, broken, onexpired, onload, renew };
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => (resolve = res));
	return { promise, resolve };
}

async function failed(img: HTMLImageElement | null) {
	if (img === null) throw new Error("no image");
	await fireEvent.error(img);
	await vi.advanceTimersByTimeAsync(0);
}

let clock = 3_000_000_000;
function advance(ms: number) {
	clock += ms;
	setNowForTesting(() => clock);
}

async function networkReturns(afterMs: number) {
	advance(afterMs);
	mediaRetry.nudge();
	await vi.advanceTimersByTimeAsync(0);
}

async function brokenByDroppedConnection() {
	failures.mediaFailure.mockResolvedValue(failure({ kind: "transport" }));
	const tile = renderImage();
	await failed(tile.image());
	await vi.advanceTimersByTimeAsync(2000);
	await failed(tile.image());
	expect(tile.broken()).not.toBeNull();
	return tile;
}

beforeEach(() => {
	advance(60 * 60 * 1000);
	probeMediaMock.mockReset();
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	failures.explainsMediaFailures.mockReturnValue(true);
	failures.mediaFailure.mockReset();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	resetNowForTesting();
});

describe("MediaImage recovery", () => {
	it("retries a dropped connection once after a short wait", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ kind: "transport" }));
		const tile = renderImage();

		await failed(tile.image());
		expect(tile.image()?.getAttribute("src")).toBe(TRANSPARENT_PIXEL);
		expect(tile.broken()).toBeNull();

		await vi.advanceTimersByTimeAsync(2000);

		expect(tile.image()?.getAttribute("src")).toBe(`${SRC}?retry=1`);
		expect(failures.mediaFailure).toHaveBeenCalledWith(SRC);
	});

	it("retries a server error but gives up when the retry fails too", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 502 }));
		const tile = renderImage();

		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);
		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);

		expect(tile.broken()).not.toBeNull();
		expect(failures.mediaFailure).toHaveBeenCalledTimes(2);
	});

	it("asks for a new signature instead of retrying a refused one", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 403 }));
		const tile = renderImage();

		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);

		expect(tile.broken()).not.toBeNull();
		expect(tile.onexpired).toHaveBeenCalledOnce();
	});

	it("retries a dropped connection even when the device clock calls the signature expired", async () => {
		failures.mediaFailure.mockResolvedValue(
			failure({ kind: "transport", signatureExpired: true }),
		);
		const tile = renderImage();

		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);

		expect(tile.image()?.getAttribute("src")).toBe(`${SRC}?retry=1`);
		expect(tile.onexpired).not.toHaveBeenCalled();
	});

	it("waits two seconds, then shows the retried photo", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ kind: "connect" }));
		const tile = renderImage();

		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(1999);
		expect(tile.image()?.getAttribute("src")).toBe(TRANSPARENT_PIXEL);
		await vi.advanceTimersByTimeAsync(1);
		const retried = tile.image()!;
		Object.defineProperty(retried, "naturalWidth", { get: () => 320 });
		await fireEvent.load(retried);

		expect(tile.onload).toHaveBeenCalledOnce();
		expect(tile.image()?.getAttribute("src")).toBe(`${SRC}?retry=1`);
	});

	it("renews a signature the retry found refused", async () => {
		failures.mediaFailure
			.mockResolvedValueOnce(failure({ kind: "transport" }))
			.mockResolvedValueOnce(failure({ status: 403 }));
		const tile = renderImage();

		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);
		await failed(tile.image());

		expect(tile.onexpired).toHaveBeenCalledOnce();
		expect(tile.broken()).not.toBeNull();
	});

	it("keeps the loading tone while the chat renews the signature", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 403 }));
		const renewal = deferred();
		const tile = renderImage({ onexpired: () => renewal.promise });

		await failed(tile.image());
		expect(tile.broken()).toBeNull();
		expect(tile.image()?.getAttribute("src")).toBe(TRANSPARENT_PIXEL);

		renewal.resolve();
		await vi.advanceTimersByTimeAsync(0);

		expect(tile.broken()).not.toBeNull();
	});

	it("renews at most once until a photo loads", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 403 }));
		const tile = renderImage();

		await failed(tile.image());
		await tile.renew(`${SRC}NEW`);
		await failed(tile.image());

		expect(tile.onexpired).toHaveBeenCalledOnce();
		expect(tile.broken()).not.toBeNull();
	});

	it("gives up on a missing file whose signature also ran out after one renewal", async () => {
		failures.mediaFailure.mockResolvedValue(
			failure({ status: 404, signatureExpired: true }),
		);
		const tile = renderImage();

		await failed(tile.image());

		expect(tile.onexpired).toHaveBeenCalledOnce();
		expect(tile.broken()).not.toBeNull();
	});

	it("shows the broken placeholder at once for a missing file", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 404 }));
		const tile = renderImage();

		await failed(tile.image());

		expect(tile.broken()).not.toBeNull();
		expect(tile.onexpired).not.toHaveBeenCalled();
	});

	it("does not wait for an explanation where the proxy cannot give one", async () => {
		failures.explainsMediaFailures.mockReturnValue(false);
		const tile = renderImage();

		await fireEvent.error(tile.image()!);

		expect(tile.broken()).not.toBeNull();
		expect(failures.mediaFailure).not.toHaveBeenCalled();
	});

	it("brings back a tile that broke on a dropped connection once the network returns", async () => {
		probeMediaMock.mockResolvedValue(vi.fn());
		const tile = await brokenByDroppedConnection();

		await networkReturns(30_000);

		expect(probeMediaMock).toHaveBeenCalledWith(
			expect.objectContaining({ src: `${SRC}?retry=2` }),
		);
		expect(tile.broken()).toBeNull();
		expect(tile.image()?.getAttribute("src")).toBe(`${SRC}?retry=2`);
	});

	it("keeps the broken icon while probes fail and stops after three tries", async () => {
		probeMediaMock.mockResolvedValue(null);
		const tile = await brokenByDroppedConnection();

		for (let round = 0; round < 5; round++) await networkReturns(31_000);

		expect(probeMediaMock).toHaveBeenCalledTimes(3);
		expect(tile.broken()).not.toBeNull();
	});

	it("waits thirty seconds after a failure before trying again", async () => {
		probeMediaMock.mockResolvedValue(null);
		await brokenByDroppedConnection();

		await networkReturns(11_000);
		expect(probeMediaMock).not.toHaveBeenCalled();

		await networkReturns(20_000);
		expect(probeMediaMock).toHaveBeenCalledOnce();
	});

	it("never brings back a missing file or a refused signature", async () => {
		failures.mediaFailure.mockResolvedValue(failure({ status: 404 }));
		const missing = renderImage();
		await failed(missing.image());
		failures.mediaFailure.mockResolvedValue(failure({ status: 403 }));
		const refused = renderImage();
		await failed(refused.image());

		await networkReturns(31_000);

		expect(probeMediaMock).not.toHaveBeenCalled();
	});

	it("abandons its probe when the tile goes away", async () => {
		let signal: AbortSignal | undefined;
		probeMediaMock.mockImplementation((probe: { signal: AbortSignal }) => {
			signal = probe.signal;
			return new Promise(() => {});
		});
		await brokenByDroppedConnection();
		await networkReturns(30_000);

		cleanup();

		expect(signal?.aborted).toBe(true);
	});

	it("tries again only on screen and only after the network came back", async () => {
		const observers: ((visible: boolean) => void)[] = [];
		vi.stubGlobal(
			"IntersectionObserver",
			class {
				constructor(callback: IntersectionObserverCallback) {
					observers.push((visible) =>
						callback(
							[
								{
									isIntersecting: visible,
								} as IntersectionObserverEntry,
							],
							this as unknown as IntersectionObserver,
						),
					);
				}
				observe() {}
				disconnect() {}
			},
		);
		probeMediaMock.mockResolvedValue(null);
		await brokenByDroppedConnection();
		const showTile = (visible: boolean) => observers.at(-1)?.(visible);

		advance(31_000);
		showTile(true);
		expect(probeMediaMock).not.toHaveBeenCalled();

		showTile(false);
		await networkReturns(0);
		expect(probeMediaMock).not.toHaveBeenCalled();

		showTile(true);
		expect(probeMediaMock).toHaveBeenCalledOnce();
		vi.unstubAllGlobals();
	});

	it("tries again once the spacing ends after a nudge that came too soon", async () => {
		probeMediaMock.mockResolvedValue(null);
		await brokenByDroppedConnection();

		await networkReturns(11_000);
		expect(probeMediaMock).not.toHaveBeenCalled();

		advance(19_000);
		await vi.advanceTimersByTimeAsync(19_000);
		expect(probeMediaMock).toHaveBeenCalledOnce();
	});

	it("hands the probe's load slot to the recovered photo", async () => {
		const release = vi.fn();
		probeMediaMock.mockResolvedValue(release);
		const tile = await brokenByDroppedConnection();
		const requestsBefore = slotRequests.count;

		await networkReturns(30_000);
		const recovered = tile.image()!;
		Object.defineProperty(recovered, "naturalWidth", { get: () => 320 });
		await fireEvent.load(recovered);

		expect(slotRequests.count).toBe(requestsBefore);
		expect(release).toHaveBeenCalledOnce();
	});

	it("abandons a probe for a photo that was replaced", async () => {
		const signals: AbortSignal[] = [];
		probeMediaMock.mockImplementation((probe: { signal: AbortSignal }) => {
			signals.push(probe.signal);
			return new Promise(() => {});
		});
		const tile = await brokenByDroppedConnection();
		await networkReturns(30_000);
		expect(signals).toHaveLength(1);

		await tile.renew(`${SRC}OTHER`);
		await failed(tile.image());
		await vi.advanceTimersByTimeAsync(2000);
		await failed(tile.image());
		await networkReturns(31_000);

		expect(signals[0]?.aborted).toBe(true);
		expect(signals).toHaveLength(2);
	});
});
