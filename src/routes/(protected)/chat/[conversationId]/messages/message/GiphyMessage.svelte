<script module lang="ts">
	import { SvelteSet } from "svelte/reactivity";

	import { registerAccountCache } from "$lib/api/account-caches";

	const loadedWithoutConsent = new SvelteSet<string>();
	registerAccountCache({ reset: () => loadedWithoutConsent.clear() });
</script>

<script lang="ts">
	import GifIcon from "phosphor-svelte/lib/GifIcon";

	import { giphyMediaSrc } from "$lib/api/messaging/giphy";
	import {
		preferencesLoaded,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import type { GiphyMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: GiphyMessage["body"] } = $props();

	const media = new MessageMediaState();
	const consented = $derived(
		preferencesLoaded() && preferencesSnapshot().giphyConsent,
	);
	const shown = $derived(
		consented || loadedWithoutConsent.has(message.urlPath),
	);
	const src = $derived(giphyMediaSrc(message.urlPath));

	let measured = $state<{
		src: string;
		width: number;
		height: number;
	} | null>(null);
	const size = $derived(
		measured !== null && measured.src === src ? measured : message,
	);
	const aspectRatio = $derived(
		size.width > 0 && size.height > 0
			? `${size.width} / ${size.height}`
			: undefined,
	);
</script>

<div
	data-slot="giphy-message"
	class={["relative", { "ms-3 w-2/5 max-w-60 min-w-35": !media.clone }]}
	{@attach media.attach}
>
	{#if shown}
		<MediaImage
			{src}
			alt="GIF"
			{aspectRatio}
			class={["w-full rounded-lg", media.cornerClass]}
			imgClass="bg-card-foreground/10"
			onload={({ naturalWidth, naturalHeight }) =>
				(measured = {
					src,
					width: naturalWidth,
					height: naturalHeight,
				})}
		/>
	{:else}
		<button
			type="button"
			class={[
				"flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-card-foreground/10 p-2 text-center text-sm text-muted-foreground",
				media.cornerClass,
			]}
			style:aspect-ratio={aspectRatio ?? "1 / 1"}
			onclick={() => loadedWithoutConsent.add(message.urlPath)}
		>
			<GifIcon weight="fill" class="size-6" />
			<span>GIF from GIPHY</span>
			<span class="text-xs">Tap to load</span>
		</button>
	{/if}
	{@render media.adornments?.()}
</div>
