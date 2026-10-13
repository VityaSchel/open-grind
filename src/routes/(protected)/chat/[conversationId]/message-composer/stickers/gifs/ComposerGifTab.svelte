<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { TabSelection } from "../../attachments/tabs";
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

	const consented = $derived(
		preferencesLoaded() && preferencesSnapshot().giphyConsent,
	);
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
		onClose();
		toast(ToastUnimplemented, {
			componentProps: { feature: "Sending a GIF", issue: 31 },
		});
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
