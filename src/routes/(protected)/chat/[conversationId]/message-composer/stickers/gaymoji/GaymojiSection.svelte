<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import type { GaymojiItem } from "$lib/api/messaging/gaymoji";
	import type { GaymojiSection } from "$lib/chat/gaymoji-sections";
	import StickerTile from "../StickerTile.svelte";
	import type { ElementRegistry } from "./element-registry";
	import { GAYMOJI_GRID_CLASS } from "./gaymoji-grid";
	import { sectionView, type SectionWindows } from "./section-windows.svelte";

	let {
		section,
		headers,
		windows,
		pickedId,
		onToggle,
	}: {
		section: GaymojiSection;
		headers: ElementRegistry<HTMLElement>;
		windows: SectionWindows;
		pickedId: string | null;
		onToggle: (gaymoji: GaymojiItem) => void;
	} = $props();

	const headingId = $props.id();
	const view = sectionView({
		windows: () => windows,
		key: () => section.key,
		count: () => section.items.length,
	});
	const visibleItems = $derived(
		section.items.slice(view.startIndex, view.endIndex),
	);
</script>

<section data-slot="gaymoji-section" aria-labelledby={headingId}>
	<h3
		{@attach headers.register(section.key)}
		id={headingId}
		class="px-1 pt-3 pb-2 text-sm font-medium text-muted-foreground"
	>
		{section.title}
	</h3>
	<div
		{@attach windows.track({
			key: section.key,
			count: section.items.length,
		})}
		data-slot="sticker-grid"
		class={GAYMOJI_GRID_CLASS}
		style:padding-top="{view.paddingTopPx}px"
		style:padding-bottom="{view.paddingBottomPx}px"
	>
		{#each visibleItems as gaymoji (gaymoji.id)}
			<StickerTile
				label={gaymoji.label}
				selected={gaymoji.id === pickedId}
				onclick={() => onToggle(gaymoji)}
				class="aspect-square"
			>
				<MediaImage
					src={gaymoji.imageUrl}
					alt={gaymoji.label}
					loading="lazy"
					fit="contain"
					skeleton
					class="block size-full rounded-lg"
				/>
			</StickerTile>
		{/each}
	</div>
</section>
