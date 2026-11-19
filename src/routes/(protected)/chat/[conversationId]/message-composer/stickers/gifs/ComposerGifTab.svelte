<script lang="ts">
	import { tick, untrack } from "svelte";

	import { preferencesLoaded } from "#lib/app-data/preferences.svelte.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
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

	const feed = new GifFeed({
		onRestart: () => {
			results.activeKey = null;
			onFeedRestart?.();
		},
	});
	const results = new RovingFocusState({
		keys: () => feed.gifs.map(({ id }) => id),
		orientation: "grid",
		wrap: "rows",
		onEdge: (edge) => edge === "up" && focusSearch(),
	});

	const consented = $derived(giphyConsented());

	let searchInput = $state<HTMLInputElement | null>(null);
	let firstResultWanted = $state(false);

	function focusSearch(): boolean {
		if (searchInput === null) return false;
		searchInput.focus();
		return true;
	}

	async function focusFirstResult() {
		await tick();
		const first = feed.gifs[0];
		if (first !== undefined && document.activeElement === searchInput)
			void results.focus({ key: first.id });
	}

	$effect(() => {
		if (!firstResultWanted || feed.loading) return;
		firstResultWanted = false;
		untrack(() => void focusFirstResult());
	});

	$effect(() => {
		if (consented && active) untrack(() => feed.start());
	});

	$effect(() => () => feed.destroy());
</script>

{#if preferencesLoaded()}
	{#if consented}
		<div data-slot="gif-tab" class="flex flex-1 flex-col">
			<GifSearchBar
				bind:input={searchInput}
				value={feed.input}
				onInput={(input) => {
					firstResultWanted = false;
					feed.setInput(input);
				}}
				onSubmit={() => feed.flush()}
				onEnterFromKeyboard={() => (firstResultWanted = true)}
				onArrowDown={() => {
					if (feed.gifs.length === 0) return false;
					void results.focus();
					return true;
				}}
				onFocus={onSearchFocus}
			/>
			{#if active}
				<GifGrid
					{feed}
					{pickedId}
					roving={results}
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
