<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Spinner } from "$lib/components/ui/spinner";

	let {
		src,
		eager,
		createdAt,
		label,
	}: {
		src: string;
		eager: boolean;
		createdAt: number | null;
		label: string;
	} = $props();

	let width: number | null = $state(null);
	let height: number | null = $state(null);
	let failedSrc: string | null = $state(null);
	const failed = $derived(failedSrc === src);
</script>

<a
	class="item relative block aspect-auto h-full max-h-[inherit] w-full shrink-0 bg-stone-700"
	data-cropped="true"
	data-pswp-width={width}
	data-pswp-height={height}
	data-created-at={createdAt}
	href={failed ? undefined : src}
	aria-disabled={failed ? "true" : undefined}
	aria-label={label}
>
	{#if eager}
		<MediaImage
			{src}
			class="absolute top-0 left-0 h-full w-full"
			imgClass="bg-stone-700"
			tone="photo"
			size="xl"
			bind:failedSrc
			onload={(image) => {
				width = image.naturalWidth;
				height = image.naturalHeight;
			}}
		/>
	{/if}
	{#if width === null && !failed}
		<Spinner
			class="pointer-events-none absolute inset-0 m-auto size-8 text-stone-400"
		/>
	{/if}
</a>

<style lang="postcss">
	@reference "$layout";
	.item {
		scroll-snap-stop: always;
	}
</style>
