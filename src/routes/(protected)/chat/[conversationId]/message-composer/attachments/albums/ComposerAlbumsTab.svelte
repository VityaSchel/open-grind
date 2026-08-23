<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import { toast } from "svelte-sonner";

	import { getMyAlbums } from "$lib/api/messaging/albums";
	import { albumShares } from "$lib/chat/album-shares.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import { getConversationState } from "../../../conversation-state.svelte";
	import SelectionGridTab from "../SelectionGridTab.svelte";
	import type { TabSelection } from "../tabs";
	import { AlbumShareActions } from "./album-share-actions.svelte";
	import AlbumTile from "./AlbumTile.svelte";

	let {
		onClose,
		onSelectionChange,
	}: {
		onClose: () => void;
		onSelectionChange: (selection: TabSelection) => void;
	} = $props();

	const conversationState = $derived(getConversationState()());
	const profileId = $derived(conversationState.profile?.profileId ?? null);
	const selected = new SelectionSet<number>(10);
	const shareActions = new AlbumShareActions();

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);
	let pendingUnshares = $state(0);

	const locked = $derived(pendingUnshares > 0);

	function isShared(albumId: number): boolean {
		return (
			profileId !== null &&
			albumShares.isSharedWith({ albumId, profileId }) === true
		);
	}

	const firstSelected = $derived(selected.values()[0]);
	const mode = $derived.by(() => {
		if (firstSelected !== undefined && isShared(firstSelected))
			return "unsharing";
		else return "sharing";
	});
	const label = $derived.by(() => {
		switch (mode) {
			case "sharing":
				return "Share";
			case "unsharing":
				return "Unshare";
		}
	});

	function isCompatible(albumId: number): boolean {
		const isAlbumShared = isShared(albumId);
		return (
			firstSelected === undefined ||
			isAlbumShared === (mode === "unsharing")
		);
	}

	async function load() {
		albums = null;
		error = null;
		try {
			albums = (await getMyAlbums()).albums;
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	$effect(() => {
		if (albums === null) return;
		void shareActions.load({
			albumIds: albums.map((album) => album.albumId),
		});
	});

	function toggleSelected(albumId: number) {
		selected.toggle(albumId);
		onSelectionChange({ count: selected.size, label });
	}

	function share({
		albumId,
		profileId,
	}: {
		albumId: number;
		profileId: number;
	}) {
		shareActions
			.update({ albumId, profileId, shared: true })
			.catch((err: unknown) => {
				console.error(err);
				toast.error("Couldn't share album");
			});
	}

	async function unshare({
		albumId,
		profileId,
	}: {
		albumId: number;
		profileId: number;
	}) {
		pendingUnshares++;
		try {
			await shareActions.update({ albumId, profileId, shared: false });
		} catch (err) {
			console.error(err);
			toast.error("Couldn't unshare album");
			selected.add(albumId);
			onSelectionChange({ count: selected.size, label });
		} finally {
			pendingUnshares--;
		}
	}

	export function submitSelection() {
		if (albums === null || profileId === null) return;
		const target = profileId;
		const albumIds = selected.values();
		const submitted = mode;
		selected.clear();
		onSelectionChange({ count: 0, label });
		if (submitted === "unsharing") {
			for (const albumId of albumIds)
				void unshare({ albumId, profileId: target });
			return;
		}
		onClose();
		for (const albumId of albumIds) share({ albumId, profileId: target });
	}
</script>

<SelectionGridTab
	items={albums}
	key={(album) => album.albumId}
	empty={albums?.length === 0}
	{error}
	onRetry={() => void load()}
	skeletons={9}
	{selected}
	gridClass="[--photo-grid-aspect:3/4]"
>
	{#snippet emptyState()}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<FolderOpenIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No albums yet</Empty.Title>
				<Empty.Description>
					Albums you create appear here, ready to share.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/snippet}
	{#snippet tile(album)}
		{@const isSelected = selected.has(album.albumId)}
		{@const isIncompatible = !isCompatible(album.albumId)}
		{@const isSelectable =
			album.isShareable &&
			!isIncompatible &&
			!locked &&
			shareActions.isResolved(album.albumId)}
		<AlbumTile
			{album}
			selected={isSelected}
			shared={isShared(album.albumId)}
			dimmed={isIncompatible || locked}
			disabled={!isSelectable}
			clickable={isSelectable && (selected.canSelectMore || isSelected)}
			onclick={() => toggleSelected(album.albumId)}
		/>
	{/snippet}
</SelectionGridTab>
