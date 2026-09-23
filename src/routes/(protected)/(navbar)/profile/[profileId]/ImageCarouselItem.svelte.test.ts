// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ImageCarouselItem from "./ImageCarouselItem.svelte";

const PROPS = {
	src: "https://cdns.grindr.com/images/profile/1024x1024/a",
	eager: true,
	createdAt: null,
	label: "Profile photo 1 of 2",
};

describe("ImageCarouselItem", () => {
	afterEach(cleanup);

	it("writes back intrinsic dimensions for the lightbox on load", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		const img = container.querySelector("img")!;
		Object.defineProperty(img, "naturalWidth", { get: () => 1024 });
		Object.defineProperty(img, "naturalHeight", { get: () => 1365 });
		await fireEvent.load(img);

		const anchor = container.querySelector("a")!;
		expect(anchor.getAttribute("data-pswp-width")).toBe("1024");
		expect(anchor.getAttribute("data-pswp-height")).toBe("1365");
	});

	it("drops the slide link but keeps the item class on failure", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		await fireEvent.error(container.querySelector("img")!);

		const anchor = container.querySelector("a")!;
		expect(anchor.hasAttribute("href")).toBe(false);
		expect(anchor.getAttribute("aria-disabled")).toBe("true");
		expect(anchor.classList.contains("item")).toBe(true);
		expect(
			container.querySelector('[data-slot="broken-media"]'),
		).not.toBeNull();
	});

	it("shows a spinner until the photo loads", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		expect(screen.queryByRole("status")).not.toBeNull();
		const img = container.querySelector("img")!;
		Object.defineProperty(img, "naturalWidth", { get: () => 1024 });
		await fireEvent.load(img);

		expect(screen.queryByRole("status")).toBeNull();
	});

	it("hides the spinner when the photo fails", async () => {
		const { container } = render(ImageCarouselItem, { props: PROPS });

		expect(screen.queryByRole("status")).not.toBeNull();
		await fireEvent.error(container.querySelector("img")!);

		expect(screen.queryByRole("status")).toBeNull();
	});

	it("keeps an unloaded photo openable behind a loading box", () => {
		const { container } = render(ImageCarouselItem, {
			props: { ...PROPS, eager: false },
		});

		const anchor = container.querySelector("a")!;
		expect(container.querySelector("img")).toBeNull();
		expect(
			container.querySelector('[data-slot="broken-media"]'),
		).toBeNull();
		expect(anchor.getAttribute("href")).toBe(PROPS.src);
		expect(anchor.hasAttribute("aria-disabled")).toBe(false);
		expect(screen.queryByRole("status")).not.toBeNull();
	});
});
