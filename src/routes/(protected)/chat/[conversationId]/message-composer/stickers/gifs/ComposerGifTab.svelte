<script lang="ts">
	import { untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { giphyConsented } from "../../../giphy-consent/giphy-consent";
	import type { TabSelection } from "../../attachments/tabs";
	import { getMessageComposerContext } from "../../message-composer-context.svelte";
	import { GifFeed } from "./gif-feed.svelte";
	import GifGrid from "./GifGrid.svelte";
	import GifSearchBar from "./GifSearchBar.svelte";
	import GiphyConsentNote from "./GiphyConsentNote.svelte";

	let {
		active,
		onSelectionChange,
		onClose,
		onFeedRestart,
		onSearchFocus,
	}: {
		active: boolean;
		onSelectionChange: (selection: TabSelection) => void;
		onClose: () => void;
		onFeedRestart?: () => void;
		onSearchFocus?: () => void;
	} = $props();

	const SEND_LABEL = "Send GIF";

	const composer = getMessageComposerContext();
	const consented = $derived(giphyConsented());
	const selected = new SelectionSet<string>();
	const feed = new GifFeed({
		onRestart: () => {
			clearSelection();
			onFeedRestart?.();
		},
	});

	let agreeing = $state(false);

	$effect(() => {
		if (consented && active) untrack(() => feed.start());
	});

	$effect(() => () => feed.destroy());

	function clearSelection() {
		if (selected.size === 0) return;
		selected.clear();
		onSelectionChange({ count: 0, label: SEND_LABEL });
	}

	function toggle(id: string) {
		selected.toggleExclusive(id);
		onSelectionChange({ count: selected.size, label: SEND_LABEL });
	}

	function agree() {
		agreeing = true;
		setPreferences({ giphyConsent: true })
			.catch((error: unknown) =>
				showErrorToast({ label: "Failed to save preferences", error }),
			)
			.finally(() => (agreeing = false));
	}

	export function submitSelection() {
		const gif = feed.gifs.find(({ id }) => selected.has(id));
		clearSelection();
		onClose();
		if (gif === undefined) return;
		void composer().sendMessages([
			draftFromMessage({ type: "Giphy", body: gif.body }),
		]);
	}
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
				<GifGrid {feed} {selected} onToggle={toggle} />
			{/if}
		</div>
	{:else}
		<GiphyConsentNote pending={agreeing} onAgree={agree} />
	{/if}
{/if}
