// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const { mediaFailureMock } = vi.hoisted(() => ({ mediaFailureMock: vi.fn() }));

vi.mock("$lib/platform/media-failure", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-failure")>()),
	mediaFailure: mediaFailureMock,
}));

import { measureImage } from "$lib/util/media-dimensions";

const SIGNED_SRC =
	"http://ogmedia.localhost/iaHR0cHM6Ly9kMy5jbG91ZGZyb250Lm5ldA";

afterEach(() => vi.restoreAllMocks());

describe("measureImage", () => {
	it("explains a failed load without the signed source", async () => {
		mediaFailureMock.mockResolvedValue({
			kind: "status",
			status: 403,
			phase: null,
			host: "d3.cloudfront.net",
			signatureExpired: true,
		});
		const create = document.createElement.bind(document);
		let image: HTMLImageElement | undefined;
		vi.spyOn(document, "createElement").mockImplementation(
			(tag: string) => {
				const element = create(tag);
				if (element instanceof HTMLImageElement) image = element;
				return element;
			},
		);

		const measured = measureImage(SIGNED_SRC);
		image?.dispatchEvent(new Event("error"));
		const error = await measured.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(
			"Failed to load image (status 403 from d3.cloudfront.net, signature expired)",
		);
		expect(mediaFailureMock).toHaveBeenCalledWith(SIGNED_SRC);
	});
});
