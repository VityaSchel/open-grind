// @vitest-environment jsdom

import PhotoSwipeLightbox from "photoswipe/lightbox";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { applyPhotoSwipeErrorUi } from "./error-ui";
import { applyPhotoSwipeLabels } from "./labels";

const teardowns: (() => void)[] = [];

afterEach(() => {
	for (const teardown of teardowns.splice(0)) teardown();
});

describe("applyPhotoSwipeLabels", () => {
	let opened: PhotoSwipeLightbox | undefined;

	afterEach(async () => {
		opened?.pswp?.close();
		await vi.waitFor(() => expect(window.pswp).toBeUndefined());
		await setLocale({ locale: SOURCE_LOCALE });
	});

	async function openLabeled({
		configure,
	}: { configure?: (lightbox: PhotoSwipeLightbox) => void } = {}) {
		const lightbox = new PhotoSwipeLightbox({
			dataSource: [
				{ src: "a.jpg", width: 100, height: 100 },
				{ src: "b.jpg", width: 100, height: 100 },
			],
			pswpModule: () => import("photoswipe"),
			showHideAnimationType: "none",
		});
		teardowns.push(() => lightbox.destroy());
		opened = lightbox;
		applyPhotoSwipeErrorUi(lightbox);
		applyPhotoSwipeLabels(lightbox);
		configure?.(lightbox);
		lightbox.init();
		lightbox.loadAndOpen(0);
		await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
		return lightbox;
	}

	const buttonLabels = () =>
		["close", "zoom", "arrow--prev", "arrow--next"].map((name) => {
			const button = document.querySelector(`.pswp__button--${name}`);
			return [
				button?.getAttribute("title"),
				button?.getAttribute("aria-label"),
			];
		});

	const translatedLabels = () =>
		[
			t("common.actions.close"),
			t("media.lightbox.zoom"),
			t("media.lightbox.previous"),
			t("media.lightbox.next"),
		].map((title) => [title, title]);

	const roleDescriptions = () =>
		[".pswp__scroll-wrap", ".pswp__item"].flatMap((selector) =>
			[...document.querySelectorAll(selector)].map((element) =>
				element.getAttribute("aria-roledescription"),
			),
		);

	const translatedRoles = () => [
		t("common.carousel.a11y.carouselRole"),
		...Array.from({ length: 3 }, () => t("common.carousel.a11y.slideRole")),
	];

	const errorLabel = () =>
		document
			.querySelector(".pswp__error-msg[role=img]")
			?.getAttribute("aria-label");

	it("titles the buttons in the locale the lightbox opens in", async () => {
		await setLocale({ locale: "en-XA" });
		await openLabeled();

		expect(buttonLabels()).toEqual(translatedLabels());
		expect(buttonLabels()[0]?.[0]).not.toBe("Close");
	});

	it("retitles the open lightbox when the locale switches", async () => {
		await openLabeled();
		expect(buttonLabels()).toEqual([
			["Close", "Close"],
			["Zoom", "Zoom"],
			["Previous", "Previous"],
			["Next", "Next"],
		]);

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(buttonLabels()).toEqual(translatedLabels());
		expect(buttonLabels()[0]?.[0]).not.toBe("Close");
	});

	it("describes the carousel and its slides in the locale the lightbox opens in", async () => {
		await setLocale({ locale: "en-XA" });
		let atFirstLayout: (string | null)[] = [];
		await openLabeled({
			configure: (lightbox) =>
				lightbox.on("initialLayout", () => {
					atFirstLayout = roleDescriptions();
				}),
		});

		expect(atFirstLayout).toEqual(translatedRoles());
		expect(roleDescriptions()).toEqual(translatedRoles());
		expect(atFirstLayout[0]).not.toBe("carousel");
	});

	it("redescribes the open carousel and its slides when the locale switches", async () => {
		await openLabeled();
		expect(roleDescriptions()).toEqual([
			"carousel",
			"slide",
			"slide",
			"slide",
		]);

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(roleDescriptions()).toEqual(translatedRoles());
		expect(roleDescriptions()[0]).not.toBe("carousel");
	});

	it("relabels a shown load error when the locale switches", async () => {
		const lightbox = await openLabeled();
		lightbox.pswp?.currSlide?.content.onError();
		expect(errorLabel()).toBe("Couldn’t load media");

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(errorLabel()).toBe(t("media.lightbox.errors.loadFailed"));
		expect(errorLabel()).not.toBe("Couldn’t load media");
	});
});
