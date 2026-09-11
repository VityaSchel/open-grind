<script lang="ts" module>
	export type EditableAlbum = {
		albumId: number;
		albumName: string | null;
		sharedCount: number;
		updatedAt: string;
		content: AlbumContent[];
	};
</script>

<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { expoOut } from "svelte/easing";
	import { fly } from "svelte/transition";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		albumItemCountLabel,
		albumUpdatedLabel,
	} from "$lib/components/album/album";
	import { setSubpageActions } from "$lib/components/shared/subpage-actions.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { bottomChrome } from "$lib/util/bottom-chrome.svelte";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import { AlbumDraft } from "./album-draft.svelte";
	import AlbumContentGrid from "./AlbumContentGrid.svelte";
	import AlbumEditorHeader from "./AlbumEditorHeader.svelte";
	import AlbumMenu from "./AlbumMenu.svelte";
	import { AlbumSharedWith } from "./shared-with-state.svelte";
	import SharedWithDialog from "./SharedWithDialog.svelte";

	let { album }: { album: EditableAlbum } = $props();

	const initial = untrack(() => album);
	const draft = new AlbumDraft(initial);
	const shares = new AlbumSharedWith({
		albumId: initial.albumId,
		sharedCount: initial.sharedCount,
	});

	let sharesOpen = $state(false);

	setSubpageActions(menu);

	function save() {
		draft
			.save()
			.then(() => toast.success("Album updated"))
			.catch((error: unknown) => {
				console.error(error);
				showErrorToast({ label: "Couldn't save album changes", error });
			});
	}
</script>

{#snippet menu()}
	<AlbumMenu albumId={draft.albumId} />
{/snippet}

<fieldset disabled={draft.saving} class="contents">
	<AlbumEditorHeader
		albumId={draft.albumId}
		bind:albumName={draft.name}
		content={draft.remaining}
		sharedCount={shares.count}
		updatedLabel={albumUpdatedLabel(draft.updatedAt)}
		onOpenShares={() => (sharesOpen = true)}
	/>
	<AlbumContentGrid
		content={draft.content}
		removed={draft.removed}
		saving={draft.saving}
		onToggleRemoved={(contentId) => draft.toggleRemoved(contentId)}
		onReorder={(positions) => draft.move(positions)}
	/>
</fieldset>
<div role="status" class="sr-only">
	{draft.removed.length > 0
		? `${albumItemCountLabel(draft.removed.length)} marked for removal`
		: ""}
</div>
{#if draft.dirty}
	<div class="h-16" aria-hidden="true"></div>
	<div
		class="sticky bottom-(--content-pb) z-10 -mx-4 px-4 py-3"
		transition:fly={{ y: 80, duration: 300, easing: expoOut }}
		{@attach bottomChrome}
	>
		<Button
			size="lg"
			class="h-12 w-full text-base"
			disabled={draft.saving}
			onclick={save}
		>
			{#if draft.saving}
				<Spinner class="size-5" />
			{/if}
			Save changes
		</Button>
	</div>
{/if}
<SharedWithDialog bind:open={sharesOpen} {shares} />
