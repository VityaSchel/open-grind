// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const failures = vi.hoisted(() => ({
	explainsMediaFailures: vi.fn(() => true),
	mediaFailure: vi.fn(),
}));

vi.mock("$lib/platform/media-failure", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-failure")>()),
	...failures,
}));

import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
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

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	failures.explainsMediaFailures.mockReturnValue(true);
	failures.mediaFailure.mockReset();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
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
});
