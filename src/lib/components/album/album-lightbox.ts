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
import { mediaFailure, remedyFor } from "$lib/platform/media-failure";
import { now } from "$lib/util/clock";
import { proxyMediaUrl } from "$lib/util/media";
import {
	measureImage,
	measureVideo,
	type MediaDimensions,
} from "$lib/util/media-dimensions";
import { applyPhotoSwipeComponent, openLightbox } from "$lib/util/photoswipe";
import { hasNoPlaysLeft, isVideoContent } from "./album";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

export type AlbumSlide = AlbumContentResponse["content"][number] &
	MediaDimensions;

const SLIDES_TTL_MS = 5 * 60 * 1000;
const UNMEASURED: MediaDimensions = { width: 1080, height: 1080 };
const SIZED_ON_LOAD: MediaDimensions = { width: 0, height: 0 };

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
	const requestedAt = now();
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
			const size =
				kind === "image"
					? SIZED_ON_LOAD
					: await (
							coverUrl === null
								? measureVideo(url)
								: measureImage(coverUrl)
						).catch(() => UNMEASURED);
			return { ...slide, url, coverUrl, ...size };
		}),
	);
	const forgottenMeanwhile =
		!isAccountEpochCurrent(epoch) || forgetCountOf(albumId) !== forgetCount;
	if (!forgottenMeanwhile && ready.length === album.content.length) {
		slidesByAlbum.set(albumId, { slides, at: requestedAt });
	}
	return slides;
}

type LightboxItem = { src: string; width: number; height: number };

export function albumPhotoRenewal({
	albumId,
	slides,
	items,
}: {
	albumId: number;
	slides: AlbumSlide[];
	items: LightboxItem[];
}) {
	const renewed = new Set<number>();
	let fresh: Promise<AlbumSlide[]> | null = null;

	return async function renew({
		index,
		refresh,
	}: {
		index: number;
		refresh: () => void;
	}): Promise<void> {
		const slide = slides[index];
		const item = items[index];
		if (slide === undefined || item === undefined) return;
		if (isVideoContent(slide.contentType) || renewed.has(slide.contentId))
			return;
		if (remedyFor(await mediaFailure(item.src)) !== "renew") return;
		renewed.add(slide.contentId);
		fresh ??= (async () => {
			forgetAlbumSlides(albumId);
			return await loadAlbumSlides(albumId);
		})().finally(() => (fresh = null));
		for (const renewedSlide of await fresh) {
			slides.forEach((old, position) => {
				const target = items[position];
				if (old.contentId !== renewedSlide.contentId || !target) return;
				if (isVideoContent(old.contentType)) return;
				target.src = renewedSlide.url;
			});
		}
		refresh();
	};
}

export function openAlbumLightbox({
	albumId,
	slides,
	signal,
	onClosed,
}: {
	albumId: number;
	slides: AlbumSlide[];
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const items = slides.map(({ url, width, height }) => ({
		src: url,
		width,
		height,
	}));
	const renew = albumPhotoRenewal({ albumId, slides, items });
	return openLightbox({
		items,
		videoAt: (index) => {
			const slide = slides[index];
			if (
				slide === undefined ||
				!isVideoContent(slide.contentType) ||
				hasNoPlaysLeft(slide)
			)
				return null;
			return { src: slide.url, poster: slide.coverUrl };
		},
		configure: (lightbox) => {
			lightbox.on("loadError", ({ content }) => {
				void renew({
					index: content.index,
					refresh: () =>
						lightbox.pswp?.refreshSlideContent(content.index),
				});
			});
			applyPhotoSwipeComponent(lightbox, {
				slideAt: (index) => {
					const slide = slides[index];
					return slide !== undefined && hasNoPlaysLeft(slide)
						? slide
						: null;
				},
				render: ({ target, slide, content }) => {
					const locked = mount(NoPlaysLeftSlide, {
						target,
						props: { still: slide.coverUrl },
					});
					content.onLoaded();
					return locked;
				},
			});
		},
		signal,
		onClosed,
	});
}
