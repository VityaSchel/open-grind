<script lang="ts">
	import "photoswipe/style.css";
	import { format } from "date-fns";
	import { UserIcon } from "phosphor-svelte";
	import z from "zod";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { backGestureEventHandlers } from "$lib/back-gesture-event.svelte";
	import { profileMediaUrl } from "$lib/media";
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
					children: ".item",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
				});
				lightbox.addFilter("itemData", (itemData) => {
					const img = itemData.element?.querySelector("img");
					if (img?.naturalWidth) {
						itemData.width = img.naturalWidth;
						itemData.height = img.naturalHeight;
					}
					return itemData;
				});
				const onBackGesture = () => {
					lightbox?.pswp?.close();
					return false;
				};
				lightbox.on("beforeOpen", () => {
					backGestureEventHandlers.add(onBackGesture);
				});
				lightbox.on("openingAnimationStart", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				});
				lightbox.on("change", () => {
					gallery?.scrollTo({
						top: lightbox?.pswp?.currSlide?.data.element?.offsetTop ?? 0,
						behavior: "instant",
					});
				});
				lightbox.on("close", () => {
					backGestureEventHandlers.delete(onBackGesture);
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
									.safeParse(pswp.currSlide?.data.element?.dataset.createdAt);
								if (createdAt !== undefined) {
									element.textContent = format(createdAt, "dd MMMM yyyy");
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

	const GAP = 4; //px
	const PADDING_VERTICAL = 8; //px
	const PADDING_HORIZONTAL = PADDING_VERTICAL;
	const BULLET_SIZE = 8; //px

	let indicatorY = $state(PADDING_VERTICAL);
	let indicatorHeight = $state(BULLET_SIZE);
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
					(item < medias.length - 1 ? Math.max(0, (frac - 0.5) * 2) : frac);
				indicatorY = PADDING_VERTICAL + tipYp * (BULLET_SIZE + GAP);
				const indicatorStretch = stretch * (BULLET_SIZE * 2 + GAP + 4);
				indicatorHeight =
					BULLET_SIZE +
					(item > 0 && item < medias.length - 1 ? indicatorStretch : 0);
			}}
		>
			{#each medias as { mediaHash, createdAt }}
				{@const src = profileMediaUrl(mediaHash, "full")}
				<ImageCarouselItem {src} thumb={src} {createdAt} />
			{/each}
		</div>
		<div
			class="absolute top-1/2 right-2 flex -translate-y-1/2 flex-col rounded-full bg-background/30 p-2 backdrop-blur-sm"
			style:gap="{GAP}px"
			style:padding="{PADDING_VERTICAL}px {PADDING_HORIZONTAL}px"
		>
			{#each medias, i (i)}
				<span class="block size-2 rounded-full bg-neutral-200/40"></span>
			{/each}
			<span
				class="absolute left-2 block w-2 rounded-full bg-neutral-300"
				style="top: {indicatorY}px; height: {BULLET_SIZE}px"
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
		.pswp .pswp__button {
			display: none;
		}
		.pswp .pswp__created-at-label {
			text-shadow: 1px 1px 3px var(--pswp-icon-color-secondary);
			@apply absolute bottom-0 left-1/2 flex w-full -translate-x-1/2 items-center justify-center bg-linear-to-t from-background/60 pt-4 font-medium text-white/90;
			height: calc(4rem + var(--safe-area-bottom));
			padding-bottom: calc(0.5rem + var(--safe-area-bottom));
		}
		.pswp .pswp__top-bar {
			margin-top: var(--safe-area-top);
		}
	}
</style>
