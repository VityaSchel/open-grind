<script lang="ts">
	import type { GaymojiSection } from "$lib/chat/gaymoji-sections";
	import type { SelectionSet } from "$lib/util/selection.svelte";
	import type { ElementRegistry } from "./element-registry";
	import GaymojiTile from "./GaymojiTile.svelte";
	import { sectionView, type SectionWindows } from "./section-windows.svelte";
	import { GAYMOJI_GRID_CLASS } from "./sticker-grid";

	let {
		section,
		headers,
		windows,
		selection,
		onToggle,
	}: {
		section: GaymojiSection;
		headers: ElementRegistry<HTMLElement>;
		windows: SectionWindows;
		selection: SelectionSet<string>;
		onToggle: (id: string) => void;
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
			<GaymojiTile
				{gaymoji}
				selected={selection.has(gaymoji.id)}
				onclick={() => onToggle(gaymoji.id)}
			/>
		{/each}
	</div>
</section>
