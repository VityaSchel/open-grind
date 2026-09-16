// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TRANSPARENT_PIXEL } from "$lib/util/load-when-visible";
import MediaImage from "./MediaImage.svelte";

const BROKEN = '[data-slot="broken-media"]';
const PENDING = '[data-slot="media-image-pending"]';
const SRC = "https://cdns.grindr.com/images/thumb/320x320/a";
const OTHER_SRC = "https://cdns.grindr.com/images/thumb/320x320/b";

function loadedImage(img: HTMLImageElement, naturalWidth: number) {
	Object.defineProperty(img, "naturalWidth", { get: () => naturalWidth });
	return fireEvent.load(img);
}

class FakeIntersectionObserver {
	static latest: FakeIntersectionObserver | null = null;
	#callback: IntersectionObserverCallback;
	#node: Element | null = null;

	constructor(callback: IntersectionObserverCallback) {
		this.#callback = callback;
		FakeIntersectionObserver.latest = this;
	}

	observe(node: Element) {
		this.#node = node;
	}

	enter() {
		this.#callback(
			[
				{
					isIntersecting: true,
					target: this.#node,
				} as unknown as IntersectionObserverEntry,
			],
			this as unknown as IntersectionObserver,
		);
	}

	unobserve() {}
	disconnect() {}
}

describe("MediaImage", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		FakeIntersectionObserver.latest = null;
	});

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

	it("holds a lazy source back until the image comes into view", async () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		const { container } = render(MediaImage, {
			props: { src: SRC, loading: "lazy" as const },
		});

		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			TRANSPARENT_PIXEL,
		);

		FakeIntersectionObserver.latest?.enter();
		await tick();

		expect(container.querySelector("img")?.src).toBe(SRC);
	});

	it("ignores the placeholder's own load rather than reporting it as the photo", async () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		const onload = vi.fn();
		const { container } = render(MediaImage, {
			props: { src: SRC, loading: "lazy" as const, onload },
		});

		await loadedImage(container.querySelector("img")!, 1);

		expect(onload).not.toHaveBeenCalled();
		expect(container.querySelector(BROKEN)).toBeNull();
	});

	it("requests an eager source straight away", () => {
		const { container } = render(MediaImage, {
			props: { src: SRC, loading: "eager" as const },
		});

		expect(container.querySelector("img")?.src).toBe(SRC);
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

	it("renders a skeleton in place of any source while the media itself is pending", () => {
		const { container } = render(MediaImage, {
			props: { src: SRC, pending: true, class: "size-full" },
		});

		const pending = container.querySelector(PENDING);
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).toBeNull();
		expect(pending?.classList.contains("animate-pulse")).toBe(true);
		expect(pending?.classList.contains("size-full")).toBe(true);
	});

	it("carries a non-empty alt onto the pending placeholder as its accessible name", () => {
		const { container } = render(MediaImage, {
			props: {
				src: SRC,
				alt: "Album video in slot 1, processing",
				pending: true,
			},
		});

		const pending = container.querySelector(PENDING);
		expect(pending?.getAttribute("role")).toBe("img");
		expect(pending?.getAttribute("aria-label")).toBe(
			"Album video in slot 1, processing",
		);
	});

	it("leaves the pending placeholder roleless for an empty alt", () => {
		const { container } = render(MediaImage, {
			props: { src: null, pending: true },
		});

		const pending = container.querySelector(PENDING);
		expect(pending).not.toBeNull();
		expect(pending?.getAttribute("role")).toBeNull();
		expect(pending?.getAttribute("aria-label")).toBeNull();
	});

	it("renders the same skeleton for a pending item with no source yet", () => {
		const withSource = render(MediaImage, {
			props: { src: SRC, pending: true },
		}).container.innerHTML;
		cleanup();
		const withoutSource = render(MediaImage, {
			props: { src: null, pending: true },
		}).container.innerHTML;

		expect(withoutSource).toContain('data-slot="media-image-pending"');
		expect(withoutSource).toBe(withSource);
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
