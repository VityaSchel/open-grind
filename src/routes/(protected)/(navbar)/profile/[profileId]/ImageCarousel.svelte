<script lang="ts">
	import "photoswipe/style.css";
	import { format } from "date-fns";
	import { UserIcon } from "phosphor-svelte";
	import z from "zod";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { profileMediaUrl } from "$lib/util/media";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeThumbDimensions,
		applyPhotoSwipeViewportSync,
	} from "$lib/util/photoswipe";
	import ImageCarouselItem from "./ImageCarouselItem.svelte";

	let {
		medias,
	}: {
		medias: {
			mediaHash: string;
			takenOnGrindr: boolean | null;
			createdAt: number | null;
		}[];
	} = $props();

	let gallery: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (!gallery) return;
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				if (!gallery) return;
				lightbox = new PhotoSwipeLightbox({
					gallery,
					children: ".item[href]",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible pswp--profile-carousel`,
				});
				applyPhotoSwipeErrorUi(lightbox);
				applyPhotoSwipeThumbDimensions(lightbox);
				applyPhotoSwipeViewportSync(lightbox);
				applyPhotoSwipeBackGesture(lightbox);
				lightbox.on("openingAnimationStart", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				});
				lightbox.on("change", () => {
					gallery?.scrollTo({
						top:
							lightbox?.pswp?.currSlide?.data.element
								?.offsetTop ?? 0,
						behavior: "instant",
					});
				});
				lightbox.on("destroy", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "visible";
						}
					});
				});
				lightbox.on("uiRegister", () => {
					lightbox?.pswp?.ui?.registerElement({
						name: "created-at-label",
						order: 9,
						appendTo: "root",
						onInit(element, pswp) {
							setTimeout(() => {
								const { data: createdAt } = z.coerce
									.number()
									.int()
									.safeParse(
										pswp.currSlide?.data.element?.dataset
											.createdAt,
									);
								if (createdAt !== undefined) {
									element.textContent = format(
										createdAt,
										"dd MMMM yyyy",
									);
								}
							}, 0);
						},
					});
				});

				lightbox.init();
			})
			.catch((error) => console.error(error));
		return () => lightbox?.destroy();
	});

	const GAP_PX = 4;
	const PADDING_VERTICAL_PX = 8;
	const PADDING_HORIZONTAL_PX = PADDING_VERTICAL_PX;
	const BULLET_SIZE_PX = 8;
	const BULLET_PITCH_PX = BULLET_SIZE_PX + GAP_PX;

	let indicatorY = $state(PADDING_VERTICAL_PX);
	let indicatorHeight = $state(BULLET_SIZE_PX);
</script>

<div class="relative aspect-3/4 h-auto max-h-photo w-full">
	{#if medias.length}
		<div
			class="carousel relative flex size-full max-h-[inherit] snap-y snap-mandatory flex-col overflow-auto *:snap-center"
			bind:this={gallery}
			onscroll={() => {
				if (!gallery) return;
				const item = gallery.scrollTop / gallery.clientHeight;
				const frac = item % 1;
				const stretch = Math.min(frac, 1 - frac);
				const index = Math.floor(item);
				const tipYp =
					Math.min(item > 0 ? index : item, medias.length - 1) +
					(item < medias.length - 1
						? Math.max(0, (frac - 0.5) * 2)
						: frac);
				indicatorY = PADDING_VERTICAL_PX + tipYp * BULLET_PITCH_PX;
				const indicatorStretch = stretch * 2 * BULLET_PITCH_PX;
				indicatorHeight =
					BULLET_SIZE_PX +
					(item > 0 && item < medias.length - 1
						? indicatorStretch
						: 0);
			}}
		>
			{#each medias as { mediaHash, createdAt }, index (mediaHash + index)}
				{@const src = profileMediaUrl({ mediaHash, size: "full" })}
				<ImageCarouselItem
					{src}
					thumb={src}
					{createdAt}
					label="Profile photo {index + 1} of {medias.length}"
				/>
			{/each}
		</div>
		<div
			class="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col rounded-full bg-background/30 scrim p-2 backdrop-filter-(--bd-veil)"
			style:gap="{GAP_PX}px"
			style:padding="{PADDING_VERTICAL_PX}px {PADDING_HORIZONTAL_PX}px"
		>
			{#each medias, i (i)}
				<span class="block size-2 rounded-full bg-neutral-200/40"
				></span>
			{/each}
			<span
				class="absolute left-2 block w-2 rounded-full bg-neutral-300"
				style:top="{indicatorY}px"
				style:height="{indicatorHeight}px"
			></span>
		</div>
	{:else}
		<div class="absolute size-full bg-neutral-700">
			<UserIcon
				weight="fill"
				color="var(--color-stone-400)"
				class="absolute top-1/2 left-1/2 size-3/4 -translate-1/2"
			/>
		</div>
	{/if}
</div>

<style lang="postcss">
	@reference "$layout";
	.carousel::-webkit-scrollbar {
		display: none;
	}
	:global {
		.pswp--profile-carousel .pswp__button:not(.pswp__button--close) {
			display: none;
		}
		.pswp--profile-carousel .pswp__button--close {
			@apply mr-3 size-11 self-center rounded-full bg-black/55 opacity-100 backdrop-filter-(--bd-veil) focus:bg-black/55 active:bg-black/55 can-hover:hover:bg-black/75;
		}
		.pswp--profile-carousel .pswp__button--close .pswp__icn {
			@apply inset-0 m-auto;
		}
		.pswp--profile-carousel .pswp__created-at-label {
			text-shadow: 1px 1px 3px var(--pswp-icon-color-secondary);
			@apply absolute bottom-0 left-1/2 flex w-full -translate-x-1/2 items-center justify-center bg-linear-to-t from-background/60 pt-4 font-medium text-white/90;
			height: calc(4rem + var(--safe-area-bottom));
			padding-bottom: calc(0.5rem + var(--safe-area-bottom));
		}
	}
</style>
