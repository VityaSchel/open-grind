<script lang="ts">
	import "photoswipe/style.css";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import type { ImageMessage } from "$lib/model/message";
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

				function setScaledRadius(img: Element) {
					if (!(img instanceof HTMLImageElement)) return;

					const radius = parseFloat(getComputedStyle(img).borderRadius);

					const rect = img.getBoundingClientRect();
					const thumbW = rect.width;

					const pswpScale = Math.min(
						window.innerWidth / img.naturalWidth,
						window.innerHeight / img.naturalHeight,
					);
					const pswpDisplayW = img.naturalWidth * pswpScale;

					const scaledRadius = radius * (pswpDisplayW / thumbW);

					document.documentElement.style.setProperty(
						"--pswp-thumb-radius",
						`${radius * 1.6}px`, // FIXME: no idea how this is calculated
					);
					document.documentElement.style.setProperty(
						"--pswp-border-radius",
						`${scaledRadius}px`,
					);
				}

				lightbox.on("afterInit", () => {
					gallery?.querySelectorAll(".item img").forEach(setScaledRadius);
				});
				lightbox.on("openingAnimationStart", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				});
				lightbox.on("openingAnimationEnd", () => {
					document.documentElement.style.removeProperty("--pswp-border-radius");
				});

				lightbox.on("close", () => {
					gallery?.querySelectorAll(".item img").forEach(setScaledRadius);
					lightbox?.pswp?.element?.classList.add("pswp--closing");
				});
				lightbox.on("closingAnimationStart", () => {
					gallery?.querySelectorAll(".item").forEach((item) => {
						if (item instanceof HTMLElement) {
							item.style.visibility = "hidden";
						}
					});
				});
				lightbox.on("closingAnimationEnd", () => {
					document.documentElement.style.removeProperty("--pswp-border-radius");
					lightbox?.pswp?.element?.classList.remove("pswp--closing");
				});

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
	class={["relative", { "w-2/5 min-w-35 max-w-60 ms-3": !media.clone }]}
	bind:this={media.el}
>
	<a
		href={message.url}
		data-pswp-width={message.width ?? undefined}
		data-pswp-height={message.height ?? undefined}
		aria-label="Open image"
		class="block item"
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
	:global(.pswp--open .pswp__img) {
		animation: pswp-radius-open var(--pswp-transition-duration)
			var(--default-transition-timing-function, ease) forwards;
	}

	:global(.pswp--open.pswp--closing .pswp__img),
	:global(.pswp__container--closing .pswp__img) {
		animation: pswp-radius-close var(--pswp-transition-duration)
			var(--default-transition-timing-function, ease) forwards;
	}

	@keyframes pswp-radius-open {
		from {
			border-radius: var(--pswp-thumb-radius);
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
			border-radius: var(--pswp-border-radius);
		}
	}
</style>
