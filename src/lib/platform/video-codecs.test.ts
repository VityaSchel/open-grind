import { afterEach, describe, expect, it, vi } from "vitest";

import { canDecodeH264 } from "./video-codecs";

function canPlayTypeReturns(value: string) {
	return vi
		.spyOn(HTMLMediaElement.prototype, "canPlayType")
		.mockReturnValue(value as CanPlayTypeResult);
}

describe("the H.264 decoder probe", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("asks about H.264 baseline in an MP4 container", () => {
		const canPlayType = canPlayTypeReturns("probably");

		canDecodeH264();

		expect(canPlayType).toHaveBeenCalledWith(
			'video/mp4; codecs="avc1.42E01E"',
		);
	});

	it.each(["probably", "maybe"])(
		"treats %s as decodable, so a broken video is not blamed on codecs",
		(answer) => {
			canPlayTypeReturns(answer);

			expect(canDecodeH264()).toBe(true);
		},
	);

	it("treats an empty answer as no decoder", () => {
		canPlayTypeReturns("");

		expect(canDecodeH264()).toBe(false);
	});
});
