// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import MediaImage from "./MediaImage.svelte";

const BROKEN = '[data-slot="broken-media"]';
const SRC = "https://cdns.grindr.com/images/thumb/320x320/a";
const OTHER_SRC = "https://cdns.grindr.com/images/thumb/320x320/b";

function loadedImage(img: HTMLImageElement, naturalWidth: number) {
	Object.defineProperty(img, "naturalWidth", { get: () => naturalWidth });
	return fireEvent.load(img);
}

describe("MediaImage", () => {
	afterEach(cleanup);

	it("renders only the image while the source is pending", () => {
		const { container } = render(MediaImage, { props: { src: SRC } });

		expect(container.querySelector("img")?.src).toBe(SRC);
		expect(container.querySelector(BROKEN)).toBeNull();
	});

	it("replaces the image with the fallback on error", async () => {
		const { container } = render(MediaImage, { props: { src: SRC } });

		await fireEvent.error(container.querySelector("img")!);

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).not.toBeNull();
	});

	it("treats a zero-dimension load as broken without calling onload", async () => {
		const onload = vi.fn();
		const { container } = render(MediaImage, {
			props: { src: SRC, onload },
		});

		await loadedImage(container.querySelector("img")!, 0);

		expect(container.querySelector(BROKEN)).not.toBeNull();
		expect(onload).not.toHaveBeenCalled();
	});

	it("keeps the image and reports onload for a real load", async () => {
		const onload = vi.fn();
		const { container } = render(MediaImage, {
			props: { src: SRC, onload },
		});

		await loadedImage(container.querySelector("img")!, 320);

		expect(container.querySelector(BROKEN)).toBeNull();
		expect(container.querySelector("img")).not.toBeNull();
		expect(onload).toHaveBeenCalledOnce();
	});

	it("renders the fallback without an image element for a null source", () => {
		const { container } = render(MediaImage, { props: { src: null } });

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).not.toBeNull();
	});

	it("re-arms when the source changes after a failure", async () => {
		const { container, rerender } = render(MediaImage, {
			props: { src: SRC },
		});

		await fireEvent.error(container.querySelector("img")!);
		expect(container.querySelector(BROKEN)).not.toBeNull();

		await rerender({ src: OTHER_SRC });

		expect(container.querySelector("img")?.src).toBe(OTHER_SRC);
		expect(container.querySelector(BROKEN)).toBeNull();
	});

	it("carries a non-empty alt onto the fallback as its accessible name", async () => {
		const { container } = render(MediaImage, {
			props: { src: SRC, alt: "Profile photo 1" },
		});

		await fireEvent.error(container.querySelector("img")!);

		const broken = container.querySelector(BROKEN);
		expect(broken?.getAttribute("role")).toBe("img");
		expect(broken?.getAttribute("aria-label")).toBe("Profile photo 1");
	});

	it("leaves the fallback roleless for an empty alt", async () => {
		const { container } = render(MediaImage, { props: { src: SRC } });

		await fireEvent.error(container.querySelector("img")!);

		const broken = container.querySelector(BROKEN);
		expect(broken?.getAttribute("role")).toBeNull();
		expect(broken?.getAttribute("aria-label")).toBeNull();
	});

	it("gives the fallback a 3 / 4 floor when no aspect ratio is known", async () => {
		const { container } = render(MediaImage, { props: { src: SRC } });

		await fireEvent.error(container.querySelector("img")!);

		const broken = container.querySelector<HTMLElement>(BROKEN);
		expect(broken?.style.aspectRatio).toBe("3 / 4");
	});

	it("keeps the known aspect ratio on the fallback", async () => {
		const { container } = render(MediaImage, {
			props: { src: SRC, aspectRatio: "600 / 800" },
		});

		await fireEvent.error(container.querySelector("img")!);

		const broken = container.querySelector<HTMLElement>(BROKEN);
		expect(broken?.style.aspectRatio).toBe("600 / 800");
	});
});
