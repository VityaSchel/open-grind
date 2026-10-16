import { unmount } from "svelte";
import type { PhotoSwipeEventsMap } from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

type Content = PhotoSwipeEventsMap["contentLoad"]["content"];

export function applyPhotoSwipeComponent<Slide>(
	lightbox: PhotoSwipeLightbox,
	{
		slideAt,
		render,
	}: {
		slideAt: (index: number) => Slide | null;
		render: (mount: {
			target: HTMLElement;
			slide: Slide;
			content: Content;
		}) => Record<string, unknown>;
	},
): void {
	const mounted = new Map<HTMLElement, Record<string, unknown>>();

	lightbox.addFilter("useContentPlaceholder", (usePlaceholder, content) =>
		slideAt(content.index) === null ? usePlaceholder : false,
	);

	lightbox.on("contentLoad", (event) => {
		const { content } = event;
		const slide = slideAt(content.index);
		if (slide === null) return;
		event.preventDefault();
		const element = document.createElement("div");
		element.className = "size-full";
		content.element = element;
		content.state = "loading";
		mounted.set(element, render({ target: element, slide, content }));
	});

	lightbox.on("contentDestroy", ({ content }) => {
		const { element } = content;
		if (!element) return;
		const component = mounted.get(element);
		if (component === undefined) return;
		mounted.delete(element);
		void unmount(component);
	});

	lightbox.on("destroy", () => {
		for (const component of mounted.values()) void unmount(component);
		mounted.clear();
	});
}
