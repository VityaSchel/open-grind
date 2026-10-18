<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import { stableSignedUrl } from "$lib/util/signed-url";
	import type { ImageMessage } from "$lib/model/messaging/messages";
	import { mediaRenewal } from "./media-renewal";
	import { attachGalleryLightbox } from "./message-lightbox";
	import { MeasuredSize, MessageMediaState } from "./message-media.svelte";

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

	const size = new MeasuredSize({
		src: () => src,
		fallback: () => message,
		ratioAllowsZero: true,
	});

	$effect(() => {
		const gallery = media.el;
		if (!gallery) return;
		return attachGalleryLightbox({ gallery });
	});
</script>

<div class={["relative", media.widthClass]} {@attach media.attach}>
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
			aspectRatio={size.aspectRatio}
			onload={(image) => {
				loadedUrl = tileUrl;
				size.measure(image);
			}}
			bind:failedSrc
			onexpired={renewMedia}
		/>
	</a>
	{@render media.adornments?.()}
</div>
