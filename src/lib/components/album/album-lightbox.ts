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
import { measureImage, type MediaDimensions } from "$lib/util/media-dimensions";
import {
	applyPhotoSwipeComponent,
	type LightboxItem,
	openLightbox,
} from "$lib/util/photoswipe";
import { applyPhotoSwipeReply } from "$lib/util/photoswipe/reply";
import type { AlbumReplyTarget } from "$lib/model/messaging/messages";
import { hasNoPlaysLeft, isVideoContent } from "./album";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

export type AlbumSlide = AlbumContentResponse["content"][number] &
	Partial<MediaDimensions>;

export function albumReplyTarget({
	album,
	slide,
}: {
	album: Pick<AlbumReplyTarget, "albumId" | "ownerProfileId" | "expiresAt">;
	slide: AlbumSlide;
}): AlbumReplyTarget {
	return {
		albumId: album.albumId,
		ownerProfileId: album.ownerProfileId,
		expiresAt: album.expiresAt,
		albumContentId: slide.contentId,
		previewUrl: slide.thumbUrl,
		viewable: true,
		contentType: slide.contentType,
	};
}

const SLIDES_TTL_MS = 5 * 60 * 1000;
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
	const requestedAt = now();
	const album = await getAlbumContent(albumId);
	const ready = album.content.filter((item) => !item.processing);
	const slides = await Promise.all(
		ready.map(async (slide) => {
			const kind = isVideoContent(slide.contentType) ? "video" : "image";
			const url = proxyMediaUrl(slide.url, { as: kind });
			const cover = proxyMediaUrl(slide.coverUrl);
			if (!hasNoPlaysLeft(slide))
				return { ...slide, url, coverUrl: cover };
			const still = cover ?? proxyMediaUrl(slide.thumbUrl);
			const size = await measureImage(still).catch(() => UNMEASURED);
			return { ...slide, url, coverUrl: still, ...size };
		}),
	);
	const forgottenMeanwhile =
		!isAccountEpochCurrent(epoch) || forgetCountOf(albumId) !== forgetCount;
	if (!forgottenMeanwhile && ready.length === album.content.length) {
		slidesByAlbum.set(albumId, { slides, at: requestedAt });
	}
	return slides;
}

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
	albumContentId,
	slides,
	onreply,
	onreact,
	signal,
	onClosed,
}: {
	albumId: number;
	albumContentId?: number;
	slides: AlbumSlide[];
	onreply?: (reply: { slide: AlbumSlide; text: string }) => void;
	onreact?: (slide: AlbumSlide) => void;
	signal: AbortSignal;
	onClosed: () => void;
}): Promise<void> {
	const index =
		albumContentId === undefined
			? 0
			: slides.findIndex((slide) => slide.contentId === albumContentId);
	if (index < 0)
		return Promise.reject(
			new Error("This album item is no longer available."),
		);
	const items = slides.map((slide) => ({
		src: slide.url,
		width: slide.width,
		height: slide.height,
	}));
	const renew = albumPhotoRenewal({ albumId, slides, items });
	const reacted = new Set<number>();
	return openLightbox({
		items,
		index,
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
			if (onreply || onreact)
				applyPhotoSwipeReply(lightbox, {
					label: "Reply to album item",
					signal,
					canReply: (pswp) => {
						const slide = slides[pswp.currIndex];
						return !!slide && !hasNoPlaysLeft(slide);
					},
					onreply: onreply
						? ({ text, pswp }) => {
								const slide = slides[pswp.currIndex];
								if (!slide) return;
								return () => onreply({ slide, text });
							}
						: undefined,
					hasReacted: (pswp) => {
						const slide = slides[pswp.currIndex];
						return !!slide && reacted.has(slide.contentId);
					},
					onreact: onreact
						? (pswp) => {
								const slide = slides[pswp.currIndex];
								if (!slide || reacted.has(slide.contentId))
									return;
								onreact(slide);
								reacted.add(slide.contentId);
							}
						: undefined,
				});
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
