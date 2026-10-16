import type PhotoSwipeLightbox from "photoswipe/lightbox";

import { type MessageKey, t } from "$lib/i18n";
import { followLocaleWhileOpen } from "./follow-locale";

const buttonTitleKeys = {
	close: "common.actions.close",
	zoom: "media.lightbox.zoom",
	arrowPrev: "media.lightbox.previous",
	arrowNext: "media.lightbox.next",
} as const satisfies Record<string, MessageKey>;

type TitledButton = keyof typeof buttonTitleKeys;

function isTitledButton(name: string | undefined): name is TitledButton {
	return name !== undefined && Object.hasOwn(buttonTitleKeys, name);
}

function labelButton({
	element,
	title,
}: {
	element: HTMLElement;
	title: string;
}): void {
	element.title = title;
	element.setAttribute("aria-label", title);
}

function describeCarouselRoles(lightbox: PhotoSwipeLightbox): void {
	const pswp = lightbox.pswp;
	if (pswp === undefined) return;
	pswp.scrollWrap?.setAttribute(
		"aria-roledescription",
		t("common.carousel.a11y.carouselRole"),
	);
	const slideRole = t("common.carousel.a11y.slideRole");
	for (const { el } of pswp.mainScroll.itemHolders)
		el.setAttribute("aria-roledescription", slideRole);
}

export function applyPhotoSwipeLabels(lightbox: PhotoSwipeLightbox): void {
	const titled = new Map<HTMLElement, TitledButton>();
	lightbox.addFilter("uiElement", (element, { name }) => {
		if (!isTitledButton(name)) return element;
		titled.set(element, name);
		labelButton({ element, title: t(buttonTitleKeys[name]) });
		return element;
	});
	lightbox.on("firstUpdate", () => {
		describeCarouselRoles(lightbox);
	});
	followLocaleWhileOpen({
		lightbox,
		apply: () => {
			for (const [element, name] of titled)
				labelButton({ element, title: t(buttonTitleKeys[name]) });
			describeCarouselRoles(lightbox);
		},
	});
	lightbox.on("destroy", () => {
		titled.clear();
	});
}
