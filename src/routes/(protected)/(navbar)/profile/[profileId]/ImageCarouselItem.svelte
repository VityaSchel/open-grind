<script lang="ts">
	let {
		src,
		thumb,
		createdAt,
	}: {
		src: string;
		thumb: string;
		createdAt: number | null;
	} = $props();

	let width: number | null = $state(null);
	let height: number | null = $state(null);
</script>

<a
	class="item relative block aspect-auto h-full max-h-[inherit] w-full shrink-0"
	data-cropped="true"
	data-pswp-width={width}
	data-pswp-height={height}
	data-created-at={createdAt}
	href={src}
	aria-label="Open image"
>
	<img
		src={thumb}
		draggable="false"
		class="absolute top-0 left-0 h-full w-full bg-stone-700 object-cover object-center"
		alt=""
		onload={(event) => {
			const img = event.currentTarget;
			if (img instanceof HTMLImageElement) {
				width = img.naturalWidth;
				height = img.naturalHeight;
			}
		}}
	/>
</a>

<style lang="postcss">
	@reference "$layout";
	.item {
		scroll-snap-stop: always;
	}
</style>
