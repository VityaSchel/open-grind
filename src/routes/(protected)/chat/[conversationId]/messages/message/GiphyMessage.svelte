<script lang="ts">
	import GifIcon from "phosphor-svelte/lib/GifIcon";
	import { prefersReducedMotion } from "svelte/motion";

	import { receivedGiphySrc } from "$lib/api/messaging/gifs";
	import { giphyOriginalUrl } from "$lib/api/messaging/giphy-link";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import type { GiphyMessage } from "$lib/model/messaging/messages";
	import GifBadge from "../../giphy/GifBadge.svelte";
	import { giphyConsented } from "../../giphy/giphy-consent";
	import GiphyConsentDialog from "../../giphy/GiphyConsentDialog.svelte";
	import { attachGalleryLightbox } from "./message-lightbox";
	import { MeasuredSize, MessageMediaState } from "./message-media.svelte";

	let { message }: { message: GiphyMessage["body"] } = $props();

	const LIGHTBOX_SCALE = 4;

	const media = new MessageMediaState();
	const shown = $derived(giphyConsented());
	const still = $derived(prefersReducedMotion.current);
	const src = $derived(
		receivedGiphySrc(still ? message.stillPath : message.urlPath),
	);
	const href = $derived(receivedGiphySrc(giphyOriginalUrl(message)));

	const size = new MeasuredSize({ src: () => src, fallback: () => message });

	let link = $state<HTMLAnchorElement | null>(null);
	let asked = $state(false);
	let asking = $state(false);

	$effect(() => {
		const gallery = media.el;
		if (!gallery || !shown) return;
		return attachGalleryLightbox({ gallery, thumbScale: LIGHTBOX_SCALE });
	});

	function focusLoadedGif(event: Event) {
		if (link === null) return;
		event.preventDefault();
		link.focus({ preventScroll: true });
	}
</script>

<div
	data-slot="giphy-message"
	class={["relative", media.widthClass]}
	{@attach media.attach}
>
	{#if shown}
		<a
			bind:this={link}
			{href}
			rel="noreferrer"
			aria-label="GIF"
			class="item relative block"
		>
			<MediaImage
				{src}
				alt="GIF"
				aspectRatio={size.aspectRatio}
				class={["w-full rounded-lg", media.cornerClass]}
				imgClass="bg-card-foreground/10"
				onload={(image) => size.measure(image)}
			/>
			{#if still}
				<GifBadge />
			{/if}
		</a>
	{:else}
		<button
			type="button"
			class={[
				"flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-card-foreground/10 p-2 text-center text-sm text-muted-foreground",
				media.cornerClass,
			]}
			style:aspect-ratio={size.aspectRatio ?? "1 / 1"}
			onclick={() => {
				asked = true;
				asking = true;
			}}
		>
			<GifIcon weight="fill" class="size-6" />
			<span>GIF from GIPHY</span>
			<span class="text-xs">Tap to load</span>
		</button>
	{/if}
	{@render media.adornments?.()}
</div>

{#if asked}
	<GiphyConsentDialog bind:open={asking} onCloseAutoFocus={focusLoadedGif} />
{/if}
