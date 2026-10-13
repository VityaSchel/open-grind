<script lang="ts">
	import GifIcon from "phosphor-svelte/lib/GifIcon";
	import SmileyIcon from "phosphor-svelte/lib/SmileyIcon";
	import { untrack } from "svelte";

	import {
		preferencesLoaded,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import poweredByGiphyBoxed from "$lib/assets/giphy/powered-by-giphy-boxed.png";
	import poweredByGiphy from "$lib/assets/giphy/powered-by-giphy.png";
	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import MediaSheetTabBar from "$lib/components/media-sheet/MediaSheetTabBar.svelte";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import type { SelectionTab, TabSelection } from "../attachments/tabs";
	import ComposerGaymojiTab from "./gaymoji/ComposerGaymojiTab.svelte";
	import ComposerGifTab from "./gifs/ComposerGifTab.svelte";

	type StickerTab = "gifs" | "gaymoji";

	let {
		open = $bindable(),
		onCloseAutoFocus,
	}: { open: boolean; onCloseAutoFocus?: (event: Event) => void } = $props();

	let selectedTab = $state<StickerTab>("gifs");
	let tabs = $state<Partial<Record<StickerTab, SelectionTab | null>>>({});
	let selections = $state<Partial<Record<StickerTab, TabSelection>>>({});
	let sheetBody = $state<ReturnType<typeof MediaSheetBody> | null>(null);

	const selection = $derived(selections[selectedTab]);
	const giphyConsented = $derived(
		preferencesLoaded() && preferencesSnapshot().giphyConsent,
	);
	const fullsize = $derived(selectedTab === "gaymoji" || giphyConsented);

	const contentOffsets: Partial<Record<StickerTab, number>> = {};

	$effect(() => {
		if (open) return;
		selections = {};
	});

	$effect.pre(() => {
		const tab = selectedTab;
		return () => {
			contentOffsets[tab] = sheetBody?.contentScrollTop() ?? 0;
		};
	});

	$effect(() => {
		const offset = contentOffsets[selectedTab] ?? 0;
		untrack(() => sheetBody?.restoreContentScrollTop(offset));
	});
</script>

<MediaSheet bind:open {fullsize} {onCloseAutoFocus}>
	<Drawer.Title class="sr-only">GIFs and stickers</Drawer.Title>
	<Tabs.Root
		bind:value={selectedTab}
		class={["min-h-0 gap-0", { "h-full": fullsize }]}
	>
		<MediaSheetBody bind:this={sheetBody} {fullsize}>
			<Tabs.Content
				value="gifs"
				class="flex-1 flex-col data-[state=active]:flex"
			>
				<ComposerGifTab
					bind:this={tabs.gifs}
					active={selectedTab === "gifs"}
					onSelectionChange={(gifSelection) =>
						(selections.gifs = gifSelection)}
					onClose={() => (open = false)}
					onFeedRestart={() => sheetBody?.scrollContentToTop()}
					onSearchFocus={() => sheetBody?.expand()}
				/>
			</Tabs.Content>
			<Tabs.Content value="gaymoji">
				<ComposerGaymojiTab
					bind:this={tabs.gaymoji}
					active={selectedTab === "gaymoji"}
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

		<MediaSheetTabBar
			trailing={selectedTab === "gifs" && giphyConsented
				? giphyAttribution
				: undefined}
		>
			{@render tab("gifs")}
			{@render tab("gaymoji")}
		</MediaSheetTabBar>
	</Tabs.Root>
</MediaSheet>

{#snippet giphyAttribution()}
	<div data-slot="gif-attribution" class="w-20 max-w-full">
		<img
			src={poweredByGiphy}
			alt="Powered by GIPHY"
			class="hidden w-full dark:block"
		/>
		<img
			src={poweredByGiphyBoxed}
			alt="Powered by GIPHY"
			class="block w-full dark:hidden"
		/>
	</div>
{/snippet}

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
