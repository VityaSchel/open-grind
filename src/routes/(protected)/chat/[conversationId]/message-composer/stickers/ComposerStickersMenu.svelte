<script lang="ts">
	import GifIcon from "phosphor-svelte/lib/GifIcon";
	import SmileyIcon from "phosphor-svelte/lib/SmileyIcon";

	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import MediaSheetTabBar from "$lib/components/media-sheet/MediaSheetTabBar.svelte";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import type { SelectionTab, TabSelection } from "../attachments/tabs";
	import StickerPlaceholderGrid from "./StickerPlaceholderGrid.svelte";

	type StickerTab = "gifs" | "gaymoji";

	let { open = $bindable() }: { open: boolean } = $props();

	let selectedTab = $state<StickerTab>("gifs");
	let tabs = $state<Partial<Record<StickerTab, SelectionTab | null>>>({});
	let selections = $state<Partial<Record<StickerTab, TabSelection>>>({});

	const selection = $derived(selections[selectedTab]);

	$effect(() => {
		if (open) return;
		selections = {};
	});
</script>

<MediaSheet bind:open>
	<Drawer.Title class="sr-only">GIFs and stickers</Drawer.Title>
	<Tabs.Root bind:value={selectedTab} class="h-full min-h-0 gap-0">
		<MediaSheetBody>
			<Tabs.Content value="gifs">
				<StickerPlaceholderGrid
					bind:this={tabs.gifs}
					item="GIF"
					columns={2}
					onSelectionChange={(gifSelection) =>
						(selections.gifs = gifSelection)}
					onClose={() => (open = false)}
				/>
			</Tabs.Content>
			<Tabs.Content value="gaymoji">
				<StickerPlaceholderGrid
					bind:this={tabs.gaymoji}
					item="Gaymoji"
					columns={4}
					onSelectionChange={(gaymojiSelection) =>
						(selections.gaymoji = gaymojiSelection)}
					onClose={() => (open = false)}
				/>
			</Tabs.Content>
		</MediaSheetBody>

		<MediaSheetActions
			aboveTabBar
			label={selection?.label ?? ""}
			count={selection?.count ?? 0}
			showCount={false}
			onSubmit={() => tabs[selectedTab]?.submitSelection()}
		/>

		<MediaSheetTabBar>
			{@render tab("gifs")}
			{@render tab("gaymoji")}
		</MediaSheetTabBar>
	</Tabs.Root>
</MediaSheet>

{#snippet tab(tab: StickerTab)}
	<Tabs.Trigger value={tab} class="h-auto flex-col gap-0.5 px-4 py-1.5">
		{#if tab === "gifs"}
			<GifIcon weight="fill" class="size-5" />
			GIFs
		{:else if tab === "gaymoji"}
			<SmileyIcon class="size-5" />
			Gaymoji
		{/if}
	</Tabs.Trigger>
{/snippet}
