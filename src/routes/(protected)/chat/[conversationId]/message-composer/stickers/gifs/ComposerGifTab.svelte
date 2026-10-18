<script lang="ts">
	import { untrack } from "svelte";

	import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
	import { giphyConsented } from "../../../giphy/giphy-consent";
	import type { StickerPick } from "../sticker-pick";
	import { GifFeed } from "./gif-feed.svelte";
	import GifGrid from "./GifGrid.svelte";
	import GifSearchBar from "./GifSearchBar.svelte";
	import GiphyConsentNote from "./GiphyConsentNote.svelte";

	let {
		active,
		pickedId,
		onPick,
		onFeedRestart,
		onSearchFocus,
	}: {
		active: boolean;
		pickedId: string | null;
		onPick: (pick: StickerPick) => void;
		onFeedRestart?: () => void;
		onSearchFocus?: () => void;
	} = $props();

	const consented = $derived(giphyConsented());
	const feed = new GifFeed({ onRestart: () => onFeedRestart?.() });

	$effect(() => {
		if (consented && active) untrack(() => feed.start());
	});

	$effect(() => () => feed.destroy());
</script>

{#if preferencesLoaded()}
	{#if consented}
		<div data-slot="gif-tab" class="flex flex-1 flex-col">
			<GifSearchBar
				value={feed.input}
				onInput={(input) => feed.setInput(input)}
				onSubmit={() => feed.flush()}
				onFocus={onSearchFocus}
			/>
			{#if active}
				<GifGrid
					{feed}
					{pickedId}
					onToggle={(gif) =>
						onPick({
							id: gif.id,
							message: { type: "Giphy", body: gif.body },
						})}
				/>
			{/if}
		</div>
	{:else}
		<GiphyConsentNote />
	{/if}
{/if}
