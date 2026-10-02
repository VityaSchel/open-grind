// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import VideoPreview from "./VideoPreview.svelte";

const SRC = "ogmedia://media/a.mp4";

describe("VideoPreview", () => {
	afterEach(cleanup);

	it("releases its source once it is gone", () => {
		const { container } = render(VideoPreview, { props: { src: SRC } });
		const video = container.querySelector<HTMLVideoElement>(
			'[data-slot="video-preview"]',
		)!;
		expect(video.getAttribute("src")).toBe(`${SRC}#t=0.001`);
		const sourcesAtLoad: (string | null)[] = [];
		video.load = () => {
			sourcesAtLoad.push(video.getAttribute("src"));
		};

		cleanup();

		expect(sourcesAtLoad).toEqual([null]);
	});
});
