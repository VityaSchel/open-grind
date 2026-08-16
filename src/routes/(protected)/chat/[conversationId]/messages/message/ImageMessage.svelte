<script lang="ts">
	import "photoswipe/style.css";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeThumbDimensions,
	} from "$lib/util/photoswipe";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import type { MediaDimensions } from "$lib/util/media-dimensions";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: ImageMessage["body"] } = $props();

	const media = new MessageMediaState();
	const src = $derived(proxyMediaUrl(message.url));

	let failedSrc: string | null = $state(null);
	const failed = $derived(failedSrc === src);

	let measured = $state<({ src: string } & MediaDimensions) | null>(null);
	const size = $derived(
		measured !== null && measured.src === src ? measured : message,
	);
	const aspectRatio = $derived(
		size.width === null || size.height === null
			? undefined
			: `${size.width} / ${size.height}`,
	);

	$effect(() => {
		const gallery = media.el;
		if (!gallery) return;
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				lightbox = new PhotoSwipeLightbox({
					gallery,
					children: "a[href]",
					pswpModule: () => import("photoswipe"),
					mainClass: "pswp--buttons-visible",
					showAnimationDuration: 500,
					hideAnimationDuration: 500,
				});
				applyPhotoSwipeErrorUi(lightbox);
				applyPhotoSwipeThumbDimensions(lightbox);
				applyPhotoSwipeBackGesture(lightbox);

				const PHOTOSWIPE_PLACEHOLDER_WIDTH_PX = 250;

				function setThumbRadii() {
					const slide = lightbox?.pswp?.currSlide;
					const thumb = slide?.data.element?.querySelector("img");
					if (!slide || !(thumb instanceof HTMLImageElement)) return;

					const thumbWidth = thumb.getBoundingClientRect().width;
					const displayedWidth =
						slide.width * slide.zoomLevels.initial;
					if (thumbWidth === 0 || displayedWidth === 0) return;

					const style = getComputedStyle(thumb);
					const corners = [
						style.borderTopLeftRadius,
						style.borderTopRightRadius,
						style.borderBottomRightRadius,
						style.borderBottomLeftRadius,
					].map(parseFloat);

					const radiiUndoingScale = (scale: number) =>
						corners
							.map((corner) => `${corner / scale}px`)
							.join(" ");

					const root = document.documentElement.style;
					root.setProperty(
						"--pswp-thumb-radius",
						radiiUndoingScale(thumbWidth / displayedWidth),
					);
					root.setProperty(
						"--pswp-placeholder-radius",
						radiiUndoingScale(
							thumbWidth / PHOTOSWIPE_PLACEHOLDER_WIDTH_PX,
						),
					);
				}

				function clearThumbRadii() {
					document.documentElement.style.removeProperty(
						"--pswp-thumb-radius",
					);
					document.documentElement.style.removeProperty(
						"--pswp-placeholder-radius",
					);
				}

				function hideThumbs() {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				}

				lightbox.on("openingAnimationStart", () => {
					setThumbRadii();
					lightbox?.pswp?.element?.classList.add(
						"pswp--radius-opening",
					);
					hideThumbs();
				});
				lightbox.on("openingAnimationEnd", () => {
					lightbox?.pswp?.element?.classList.remove(
						"pswp--radius-opening",
					);
					clearThumbRadii();
				});

				lightbox.on("closingAnimationStart", () => {
					setThumbRadii();
					lightbox?.pswp?.element?.classList.add(
						"pswp--radius-closing",
					);
					hideThumbs();
				});
				lightbox.on("closingAnimationEnd", clearThumbRadii);

				lightbox.on("destroy", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "visible";
						}
					});
				});

				lightbox.init();
			})
			.catch((error) => console.error(error));
		return () => lightbox?.destroy();
	});
</script>

<div
	class={["relative", { "ms-3 w-2/5 max-w-60 min-w-35": !media.clone }]}
	{@attach media.attach}
>
	<a
		href={failed ? undefined : src}
		rel="noreferrer"
		data-pswp-width={size.width ?? undefined}
		data-pswp-height={size.height ?? undefined}
		aria-label="Photo"
		aria-disabled={failed ? "true" : undefined}
		class="item block"
	>
		<MediaImage
			{src}
			class={["w-full rounded-lg", media.cornerClass]}
			imgClass="bg-card-foreground/10"
			{aspectRatio}
			onload={({ naturalWidth, naturalHeight }) => {
				measured = { src, width: naturalWidth, height: naturalHeight };
			}}
			bind:failedSrc
		/>
	</a>
	{@render media.adornments?.()}
</div>

<style>
	:global(.pswp__img) {
		--pswp-radius: var(--pswp-thumb-radius);
	}
	:global(img.pswp__img--placeholder) {
		--pswp-radius: var(--pswp-placeholder-radius);
	}

	:global(.pswp--radius-opening .pswp__img) {
		animation: pswp-radius-open var(--pswp-transition-duration)
			var(--default-transition-timing-function, ease) forwards;
	}

	:global(.pswp--radius-closing .pswp__img) {
		animation: pswp-radius-close var(--pswp-transition-duration)
			var(--default-transition-timing-function, ease) forwards;
	}

	@keyframes pswp-radius-open {
		from {
			border-radius: var(--pswp-radius);
		}
		to {
			border-radius: 0px;
		}
	}

	@keyframes pswp-radius-close {
		from {
			border-radius: 0px;
		}
		to {
			border-radius: var(--pswp-radius);
		}
	}
</style>
