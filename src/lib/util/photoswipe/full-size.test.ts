// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as FullSize from "./full-size";

const PHOTO = "http://ogmedia.localhost/rightnow/full/1";
const OTHER_PHOTO = "http://ogmedia.localhost/rightnow/full/2";
const SIZE = { width: 1200, height: 1600 };

class FakeImage {
	static made: FakeImage[] = [];
	decoding = "";
	src = "";
	naturalWidth = 0;
	naturalHeight = 0;
	#decoded = Promise.withResolvers<void>();
	constructor() {
		FakeImage.made.push(this);
	}
	decode(): Promise<void> {
		return this.#decoded.promise;
	}
	decodeAs({ width, height }: { width: number; height: number }) {
		this.naturalWidth = width;
		this.naturalHeight = height;
		this.#decoded.resolve();
	}
	failToDecode() {
		this.#decoded.reject(
			new DOMException(
				"The source image cannot be decoded.",
				"EncodingError",
			),
		);
	}
}

let fullSize: typeof FullSize;

function preloadSixtyFourOthers() {
	for (let index = 0; index < 64; index++)
		void fullSize.preloadFullImage(
			`http://ogmedia.localhost/rightnow/full/other-${index}`,
		);
}

beforeEach(async () => {
	vi.stubGlobal("Image", FakeImage);
	FakeImage.made = [];
	vi.resetModules();
	fullSize = await import("./full-size");
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("preloadFullImage", () => {
	it("decodes a full-size photo off the main thread once, however often it is asked for", () => {
		const first = fullSize.preloadFullImage(PHOTO);
		const again = fullSize.preloadFullImage(PHOTO);

		expect(again).toBe(first);
		expect(FakeImage.made).toHaveLength(1);
		expect(FakeImage.made[0]).toMatchObject({
			src: PHOTO,
			decoding: "async",
		});
	});

	it("knows a photo's size only once it has decoded", async () => {
		const decoded = fullSize.preloadFullImage(PHOTO);
		expect(fullSize.knownFullImageSize(PHOTO)).toBeNull();

		FakeImage.made[0]!.decodeAs(SIZE);

		await expect(decoded).resolves.toStrictEqual(SIZE);
		expect(fullSize.knownFullImageSize(PHOTO)).toStrictEqual(SIZE);
		expect(fullSize.knownFullImageSize(OTHER_PHOTO)).toBeNull();
	});

	it("answers null for a photo that fails to decode and decodes it afresh when asked again", async () => {
		const failed = fullSize.preloadFullImage(PHOTO);
		FakeImage.made[0]!.failToDecode();

		await expect(failed).resolves.toBeNull();
		expect(fullSize.knownFullImageSize(PHOTO)).toBeNull();

		const retried = fullSize.preloadFullImage(PHOTO);
		expect(retried).not.toBe(failed);
		expect(FakeImage.made).toHaveLength(2);
		FakeImage.made[1]!.decodeAs(SIZE);

		await expect(retried).resolves.toStrictEqual(SIZE);
		expect(fullSize.knownFullImageSize(PHOTO)).toStrictEqual(SIZE);
	});

	it("remembers the latest 64 photos, forgetting the oldest and decoding it afresh when asked again", async () => {
		const photos = Array.from(
			{ length: 65 },
			(_, index) => `http://ogmedia.localhost/rightnow/full/${index}`,
		);
		for (const [index, photo] of photos.entries()) {
			const decoded = fullSize.preloadFullImage(photo);
			FakeImage.made[index]!.decodeAs({
				width: 100 + index,
				height: 200,
			});
			await decoded;
		}

		expect(fullSize.knownFullImageSize(photos[0]!)).toBeNull();
		expect(fullSize.knownFullImageSize(photos[1]!)).toStrictEqual({
			width: 101,
			height: 200,
		});
		expect(fullSize.knownFullImageSize(photos[64]!)).toStrictEqual({
			width: 164,
			height: 200,
		});

		void fullSize.preloadFullImage(photos[1]!);
		expect(FakeImage.made).toHaveLength(65);
		void fullSize.preloadFullImage(photos[0]!);
		expect(FakeImage.made).toHaveLength(66);
	});

	it("leaves no size behind for a photo forgotten while it was still decoding", async () => {
		const evicted = fullSize.preloadFullImage(PHOTO);
		preloadSixtyFourOthers();

		FakeImage.made[0]!.decodeAs(SIZE);
		await evicted;

		expect(fullSize.knownFullImageSize(PHOTO)).toBeNull();
	});

	it("keeps a newer decode when an older, forgotten one for the same photo fails", async () => {
		const evicted = fullSize.preloadFullImage(PHOTO);
		preloadSixtyFourOthers();
		const newer = fullSize.preloadFullImage(PHOTO);

		FakeImage.made[0]!.failToDecode();
		await evicted;

		expect(fullSize.preloadFullImage(PHOTO)).toBe(newer);
	});
});

describe("fullImageSizeInTime", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	});

	it("gives up with null once the wait runs out, while the photo keeps decoding for later", async () => {
		const settled = vi.fn();
		void fullSize.fullImageSizeInTime(PHOTO).then(settled);

		await vi.advanceTimersByTimeAsync(1499);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalledExactlyOnceWith(null);

		FakeImage.made[0]!.decodeAs(SIZE);
		await expect(fullSize.preloadFullImage(PHOTO)).resolves.toStrictEqual(
			SIZE,
		);
		expect(fullSize.knownFullImageSize(PHOTO)).toStrictEqual(SIZE);
		expect(FakeImage.made).toHaveLength(1);
	});

	it("gives the size when the photo decodes in time, joining the decode already under way", async () => {
		void fullSize.preloadFullImage(PHOTO);
		const sized = fullSize.fullImageSizeInTime(PHOTO);

		await vi.advanceTimersByTimeAsync(1000);
		FakeImage.made[0]!.decodeAs(SIZE);

		await expect(sized).resolves.toStrictEqual(SIZE);
		expect(FakeImage.made).toHaveLength(1);
	});
});
