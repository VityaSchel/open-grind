import { mount } from "svelte";

import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import {
	type AlbumContentResponse,
	getAlbumContent,
} from "$lib/api/messaging/albums";
import { now } from "$lib/util/clock";
import { proxyMediaUrl } from "$lib/util/media";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeBackGesture,
	applyPhotoSwipeComponent,
	applyPhotoSwipeErrorUi,
	applyPhotoSwipeVideo,
	applyPhotoSwipeViewportSync,
} from "$lib/util/photoswipe";
import { hasNoPlaysLeft, isVideoContent } from "./album";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

export type AlbumSlide = AlbumContentResponse["content"][number] &
	MediaDimensions;

const SLIDES_TTL_MS = 10 * 60 * 1000;
const UNMEASURED: MediaDimensions = { width: 1080, height: 1080 };

const slidesByAlbum = new Map<number, { slides: AlbumSlide[]; at: number }>();
const forgetCountByAlbum = new Map<number, number>();

registerAccountCache({ reset: () => slidesByAlbum.clear() });

function forgetCountOf(albumId: number): number {
	return forgetCountByAlbum.get(albumId) ?? 0;
}

export function forgetAlbumSlides(albumId: number): void {
	slidesByAlbum.delete(albumId);
	forgetCountByAlbum.set(albumId, forgetCountOf(albumId) + 1);
}

export async function loadAlbumSlides(albumId: number): Promise<AlbumSlide[]> {
	const cached = slidesByAlbum.get(albumId);
	if (cached !== undefined && now() - cached.at < SLIDES_TTL_MS) {
		return cached.slides;
	}
	const epoch = accountEpoch();
	const forgetCount = forgetCountOf(albumId);
	const album = await getAlbumContent(albumId);
	const ready = album.content.filter((item) => !item.processing);
	const slides = await Promise.all(
		ready.map(async (slide) => {
			const kind = isVideoContent(slide.contentType) ? "video" : "image";
			const url = proxyMediaUrl(slide.url, { as: kind });
			const cover = proxyMediaUrl(slide.coverUrl);
			const coverUrl = hasNoPlaysLeft(slide)
				? (cover ?? proxyMediaUrl(slide.thumbUrl))
				: cover;
			const measurable = { video: coverUrl, image: url }[kind];
			const size = await (
				measurable === null
					? measureVideo(url)
					: measureImage(measurable)
			).catch(() => UNMEASURED);
			return { ...slide, url, coverUrl, ...size };
		}),
	);
	const forgottenMeanwhile =
		!isAccountEpochCurrent(epoch) || forgetCountOf(albumId) !== forgetCount;
	if (!forgottenMeanwhile && ready.length === album.content.length) {
		slidesByAlbum.set(albumId, { slides, at: now() });
	}
	return slides;
}

export async function openAlbumLightbox({
	slides,
	signal,
	onClosed,
}: {
	slides: AlbumSlide[];
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
	if (signal.aborted) return;
	const lightbox = new PhotoSwipeLightbox({
		showHideAnimationType: "fade",
		pswpModule: () => import("photoswipe"),
		mainClass: "pswp--buttons-visible",
	});
	applyPhotoSwipeErrorUi(lightbox);
	applyPhotoSwipeViewportSync(lightbox);
	lightbox.addFilter("numItems", () => slides.length);
	lightbox.addFilter("itemData", (itemData, index) => {
		const slide = slides[index];
		if (slide === undefined) return itemData;
		return { src: slide.url, width: slide.width, height: slide.height };
	});
	applyPhotoSwipeBackGesture(lightbox);
	applyPhotoSwipeVideo(lightbox, (index) => {
		const slide = slides[index];
		if (
			slide === undefined ||
			!isVideoContent(slide.contentType) ||
			hasNoPlaysLeft(slide)
		)
			return null;
		return { src: slide.url, poster: slide.coverUrl };
	});
	applyPhotoSwipeComponent(
		lightbox,
		(index) => {
			const slide = slides[index];
			return slide !== undefined && hasNoPlaysLeft(slide) ? slide : null;
		},
		(target, slide, content) => {
			const locked = mount(NoPlaysLeftSlide, {
				target,
				props: { still: slide.coverUrl },
			});
			content.onLoaded();
			return locked;
		},
	);
	lightbox.on("closingAnimationEnd", onClosed);
	signal.addEventListener("abort", () => lightbox.destroy(), { once: true });
	lightbox.init();
	lightbox.loadAndOpen(0);
}
