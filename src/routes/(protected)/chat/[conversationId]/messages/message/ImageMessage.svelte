<script lang="ts">
	import "photoswipe/style.css";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		message,
	}: {
		message: ImageMessage["body"];
	} = $props();

	const media = new MessageMediaState();

	$effect(() => {
		const gallery = media.el;
		if (!gallery) return;
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				lightbox = new PhotoSwipeLightbox({
					gallery,
					children: "a",
					pswpModule: () => import("photoswipe"),
					mainClass: "pswp--buttons-visible",
					showAnimationDuration: 500,
					hideAnimationDuration: 500,
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
				lightbox.on("close", () => {
					backGestureEventHandlers.delete(onBackGesture);
				});

				// Radius is scaled by the zoom-wrap transform, so pre-divide it by that scale
				// img placeholder does a second scale off a 250px box
				const PLACEHOLDER_BASE_WIDTH = 250;

				function setThumbRadii() {
					const slide = lightbox?.pswp?.currSlide;
					const thumb = slide?.data.element?.querySelector("img");
					if (!slide || !(thumb instanceof HTMLImageElement)) return;

					const thumbWidth = thumb.getBoundingClientRect().width;
					const displayedWidth = slide.width * slide.zoomLevels.initial;
					if (thumbWidth === 0 || displayedWidth === 0) return;

					const style = getComputedStyle(thumb);
					const corners = [
						style.borderTopLeftRadius,
						style.borderTopRightRadius,
						style.borderBottomRightRadius,
						style.borderBottomLeftRadius,
					].map(parseFloat);

					const scaled = (factor: number) =>
						corners.map((corner) => `${corner * factor}px`).join(" ");

					const root = document.documentElement.style;
					root.setProperty(
						"--pswp-thumb-radius",
						scaled(displayedWidth / thumbWidth),
					);
					root.setProperty(
						"--pswp-placeholder-radius",
						scaled(PLACEHOLDER_BASE_WIDTH / thumbWidth),
					);
				}

				function clearThumbRadii() {
					document.documentElement.style.removeProperty("--pswp-thumb-radius");
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
					lightbox?.pswp?.element?.classList.add("pswp--radius-opening");
					hideThumbs();
				});
				lightbox.on("openingAnimationEnd", () => {
					lightbox?.pswp?.element?.classList.remove("pswp--radius-opening");
					clearThumbRadii();
				});

				lightbox.on("closingAnimationStart", () => {
					setThumbRadii();
					lightbox?.pswp?.element?.classList.add("pswp--radius-closing");
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
	bind:this={media.el}
>
	<a
		href={message.url}
		rel="noreferrer"
		data-pswp-width={message.width ?? undefined}
		data-pswp-height={message.height ?? undefined}
		aria-label="Open image"
		class="item block"
	>
		<img
			src={message.url}
			alt=""
			class={[
				"w-full rounded-lg bg-card-foreground/10 object-cover",
				media.cornerClass,
			]}
			style:aspect-ratio={message.width !== null && message.height !== null
				? `${message.width} / ${message.height}`
				: undefined}
			draggable="false"
		/>
	</a>
	{@render media.adornments?.()}
</div>

<style>
	:global(.pswp__img) {
		--pswp-radius: var(--pswp-thumb-radius);
	}
	/* div placeholders are sized directly and keep --pswp-thumb-radius */
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
