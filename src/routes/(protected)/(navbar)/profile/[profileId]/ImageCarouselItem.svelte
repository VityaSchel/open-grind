<script lang="ts">
	import MatureContentCover from "#lib/components/mature-content/MatureContentCover.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";

	let {
		src,
		mediaHash,
		eager,
		createdAt,
		label,
		covered = false,
	}: {
		src: string;
		mediaHash: string;
		eager: boolean;
		createdAt: number | null;
		label: string;
		covered?: boolean;
	} = $props();

	let width: number | null = $state(null);
	let height: number | null = $state(null);
	let failedSrc: string | null = $state(null);
	const failed = $derived(failedSrc === src);
</script>

<svelte:element
	this={covered ? "div" : "a"}
	class="item relative block aspect-auto h-full max-h-[inherit] w-full shrink-0 bg-stone-700"
	data-cropped="true"
	data-pswp-width={width}
	data-pswp-height={height}
	data-created-at={createdAt}
	data-media-hash={mediaHash}
	href={covered || failed ? undefined : src}
	role={covered ? "group" : undefined}
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
		{#if width === null && !failed}
			<Spinner
				class="pointer-events-none absolute inset-0 m-auto size-8 text-stone-400"
			/>
		{/if}
	{/if}
	{#if covered}
		<MatureContentCover />
	{/if}
</svelte:element>

<style lang="postcss">
	@reference "$layout";
	.item {
		scroll-snap-stop: always;
	}
</style>
