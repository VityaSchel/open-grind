<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type AlbumContentResponse,
		getAlbumStorageLimits,
	} from "$lib/api/messaging/albums";
	import { albumItemCountLabel } from "$lib/components/album/album";
	import SaveChangesBar from "$lib/components/shared/SaveChangesBar.svelte";
	import { setSubpageActions } from "$lib/components/shared/subpage-actions-context.svelte";
	import {
		getAlbumUploads,
		type UploadLimits,
	} from "../album-uploads/album-uploads-state.svelte";
	import {
		AlbumDraftState,
		StillProcessingError,
	} from "./album-draft-state.svelte";
	import AlbumContentGrid from "./AlbumContentGrid.svelte";
	import AlbumEditorHeader from "./AlbumEditorHeader.svelte";
	import AlbumMenu from "./AlbumMenu.svelte";
	import { AlbumSharedWith } from "./shared-with-state.svelte";
	import SharedWithDialog from "./SharedWithDialog.svelte";

	let {
		album,
		ourProfileId,
	}: {
		album: Pick<
			AlbumContentResponse,
			"albumId" | "albumName" | "sharedCount" | "updatedAt" | "content"
		>;
		ourProfileId: number;
	} = $props();

	const initial = untrack(() => album);
	const uploads = untrack(() => getAlbumUploads(ourProfileId));
	const draft = new AlbumDraftState({
		...initial,
		uploadsPending: () => uploads.hasPending(initial.albumId),
	});
	const shares = new AlbumSharedWith({
		albumId: initial.albumId,
		sharedCount: initial.sharedCount,
	});

	let sharesOpen = $state(false);
	let limits = $state<UploadLimits | null>(null);

	const pending = $derived(uploads.pending(draft.albumId));

	setSubpageActions(menu);

	getAlbumStorageLimits()
		.then((resolved) => (limits = resolved))
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
		{pending}
		{limits}
		sharedCount={shares.count}
		updatedAt={draft.updatedAt}
		onOpenShares={() => (sharesOpen = true)}
	/>
	<AlbumContentGrid
		{uploads}
		albumId={draft.albumId}
		content={draft.content}
		{pending}
		removed={draft.removed}
		saving={draft.saving}
		{limits}
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
