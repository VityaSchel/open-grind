<script lang="ts">
	import "photoswipe/style.css";

	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import { stableSignedUrl } from "$lib/util/signed-url";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import type { MediaDimensions } from "$lib/util/media-dimensions";
	import { mediaRenewal } from "./media-renewal";
	import { openInLightbox } from "./message-lightbox";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: ImageMessage["body"] } = $props();

	const media = new MessageMediaState();
	const renewMedia = mediaRenewal();
	let loadedUrl = $state<string | null>(null);
	const tileUrl = $derived(
		stableSignedUrl({ latest: message.url, loaded: loadedUrl }),
	);
	const src = $derived(proxyMediaUrl(tileUrl));
	const href = $derived(proxyMediaUrl(message.url));

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
		return openInLightbox({ gallery });
	});
</script>

<div
	class={["relative", { "ms-3 w-2/5 max-w-60 min-w-35": !media.clone }]}
	{@attach media.attach}
>
	<a
		href={failed ? undefined : href}
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
				loadedUrl = tileUrl;
				measured = { src, width: naturalWidth, height: naturalHeight };
			}}
			bind:failedSrc
			onexpired={renewMedia}
		/>
	</a>
	{@render media.adornments?.()}
</div>
