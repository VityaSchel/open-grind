<script lang="ts">
	import { matureContentCovered } from "#lib/components/mature-content/mature-content.ts";
	import MatureContentCover from "#lib/components/mature-content/MatureContentCover.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { attachGalleryLightbox } from "#lib/util/photoswipe/gallery-lightbox.ts";
	import { stableSignedUrl } from "#lib/util/signed-url.ts";
	import type { ImageMessage } from "#lib/model/messaging/messages.ts";
	import { mediaRenewal } from "./media-renewal";
	import { MeasuredSize, MessageMediaState } from "./message-media.svelte";

	let { message, isOut }: { message: ImageMessage["body"]; isOut: boolean } =
		$props();

	const media = new MessageMediaState();
	const covered = $derived(!isOut && matureContentCovered());
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
	<svelte:element
		this={covered ? "div" : "a"}
		href={covered || failed ? undefined : href}
		rel={covered ? undefined : "noreferrer"}
		data-pswp-width={size.width ?? undefined}
		data-pswp-height={size.height ?? undefined}
		role={covered ? "group" : undefined}
		aria-label={t("chat.messagePreview.photo")}
		aria-disabled={failed ? "true" : undefined}
		class="item relative block"
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
		{#if covered}
			<MatureContentCover class={["rounded-lg", media.cornerClass]} />
		{/if}
	</svelte:element>
	{@render media.adornments?.()}
</div>
