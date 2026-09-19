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

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		albumItemCountLabel,
		albumUpdatedLabel,
	} from "$lib/components/album/album";
	import SaveChangesBar from "$lib/components/shared/SaveChangesBar.svelte";
	import { setSubpageActions } from "$lib/components/shared/subpage-actions.svelte";
	import type { AlbumContent } from "$lib/model/messaging/albums";
	import { uploads } from "../album-uploads/album-uploads.svelte";
	import { AlbumDraft, StillProcessingError } from "./album-draft.svelte";
	import AlbumContentGrid from "./AlbumContentGrid.svelte";
	import AlbumEditorHeader from "./AlbumEditorHeader.svelte";
	import AlbumMenu from "./AlbumMenu.svelte";
	import { AlbumSharedWith } from "./shared-with-state.svelte";
	import SharedWithDialog from "./SharedWithDialog.svelte";

	let { album }: { album: EditableAlbum } = $props();

	const initial = untrack(() => album);
	const draft = new AlbumDraft({
		...initial,
		uploadsPending: () => uploads.hasPending(initial.albumId),
	});
	const shares = new AlbumSharedWith({
		albumId: initial.albumId,
		sharedCount: initial.sharedCount,
	});

	let sharesOpen = $state(false);

	const pending = $derived(uploads.pending(draft.albumId));

	setSubpageActions(menu);

	void uploads
		.storageLimits()
		.catch((error: unknown) => console.error(error));

	$effect(() => {
		const { albumId } = draft;
		uploads.attachDraft({ albumId, draft });
		return () => uploads.detachDraft({ albumId, draft });
	});

	function save() {
		draft
			.save()
			.then(() => toast.success("Album updated"))
			.catch((error: unknown) => {
				console.error(error);
				if (error instanceof StillProcessingError) {
					toast.error(
						"This video is still processing. Try removing it again in a moment",
					);
					return;
				}
				showErrorToast({ label: "Couldn't save album changes", error });
			});
	}
</script>

{#snippet menu()}
	<AlbumMenu albumId={draft.albumId} saving={draft.saving} />
{/snippet}

<fieldset disabled={draft.saving} class="contents">
	<AlbumEditorHeader
		albumId={draft.albumId}
		bind:albumName={draft.name}
		content={draft.remaining}
		maxPhotos={uploads.limits?.maxContentItemsPerAlbum ?? null}
		maxVideos={uploads.limits?.maxVideosPerAlbum ?? null}
		sharedCount={shares.count}
		updatedLabel={albumUpdatedLabel(draft.updatedAt)}
		onOpenShares={() => (sharesOpen = true)}
	/>
	<AlbumContentGrid
		albumId={draft.albumId}
		content={draft.content}
		{pending}
		removed={draft.removed}
		saving={draft.saving}
		maxPhotos={uploads.limits?.maxContentItemsPerAlbum ?? null}
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
	<SaveChangesBar
		saving={draft.saving}
		disabled={!draft.canSave}
		onclick={save}
	/>
{/if}
<SharedWithDialog bind:open={sharesOpen} {shares} />
