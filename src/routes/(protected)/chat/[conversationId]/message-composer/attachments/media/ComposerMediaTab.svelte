<script lang="ts">
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		addMediaToDrawer,
		CHAT_MEDIA_MAX_LABEL,
		UnsupportedChatMediaError,
	} from "$lib/api/messaging/chat-media";
	import {
		deleteDrawerMedia,
		type DrawerMedia,
		getDrawerMedia,
	} from "$lib/api/messaging/drawer";
	import { uploadRefusalMessage } from "$lib/api/methods";
	import DeleteMediaDialog from "$lib/components/media-sheet/DeleteMediaDialog.svelte";
	import MediaTileMenu from "$lib/components/media-sheet/MediaTileMenu.svelte";
	import { TileMenuState } from "$lib/components/media-sheet/tile-menu.svelte";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaGrid from "$lib/components/shared/MediaGrid.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { mediaFileKindOf } from "$lib/platform/media-file";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { getConversationState } from "../../../conversation-state.svelte";
	import { getMessageComposerContext } from "../../message-composer-context.svelte";
	import type { TabSelection } from "../tabs";
	import { mediaMessageDraft } from "./media-messages";
	import MediaTile from "./MediaTile.svelte";
	import SentOverlay from "./SentOverlay.svelte";

	let {
		onClose,
		onSelectionChange,
		expiring,
	}: {
		onClose: () => void;
		onSelectionChange: (selection: TabSelection) => void;
		expiring: boolean;
	} = $props();

	const composer = getMessageComposerContext();
	const conversationState = $derived(getConversationState()());
	const selected = new SelectionSet<number>(10);

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);
	let uploadingCount = $state(0);
	let deleteTarget = $state<DrawerMedia | null>(null);
	const deleting = new SvelteSet<number>();
	const menu = new TileMenuState<DrawerMedia>();

	$effect(() => {
		void media;
		void uploadingCount;
		untrack(() => menu.close());
	});

	async function load() {
		media = null;
		error = null;
		try {
			media = await getDrawerMedia(conversationState.conversationId);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	function addFailureMessage(err: unknown): string {
		if (err instanceof UnsupportedChatMediaError) return err.message;
		return (
			uploadRefusalMessage({
				error: err,
				limitLabel: CHAT_MEDIA_MAX_LABEL,
			}) ?? "Couldn't add photo or video"
		);
	}

	async function addMedia() {
		let picked;
		try {
			picked = await pickMultipleMedia("media");
		} catch (err) {
			console.error(err);
			toast.error("Couldn't open the picker");
			return;
		}
		if (picked.length === 0) return;

		uploadingCount += picked.length;
		for (const item of picked) {
			try {
				const added = await addMediaToDrawer(item);
				media = [
					added,
					...(media ?? []).filter(({ id }) => id !== added.id),
				];
			} catch (err) {
				console.error(err);
				toast.error(addFailureMessage(err));
			} finally {
				uploadingCount--;
			}
		}
	}

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange({ count: selected.size, label: "Send" });
	}

	function isVideo(item: DrawerMedia): boolean {
		return mediaFileKindOf(item.contentType) === "video";
	}

	async function deletePermanently(item: DrawerMedia) {
		deleting.add(item.id);
		try {
			await deleteDrawerMedia(item.id);
			media = (media ?? []).filter(({ id }) => id !== item.id);
			if (selected.has(item.id)) toggleSelected(item.id);
		} catch (err) {
			console.error(err);
			showErrorToast({
				label: isVideo(item)
					? "Couldn't delete video"
					: "Couldn't delete photo",
				error: err,
			});
		} finally {
			deleting.delete(item.id);
		}
	}

	export function submitSelection() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		const sendAsExpiring = expiring;
		selected.clear();
		onClose();
		for (const item of items) item.used = true;
		void composer().sendMessages(
			items.map((item) =>
				mediaMessageDraft({ item, expiring: sendAsExpiring }),
			),
		);
	}
</script>

<MediaGrid
	items={media}
	key={(item) => item.id}
	empty={media?.length === 0 && uploadingCount === 0}
	{error}
	onRetry={() => void load()}
	skeletons={12}
	{selected}
>
	{#snippet emptyState()}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<ImageIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No media sent yet</Empty.Title>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={addMedia}>
					<PlusIcon weight="bold" />
					Add photo or video
				</Button>
			</Empty.Content>
		</Empty.Root>
	{/snippet}
	{#snippet leading()}
		<AddTile
			label="Add photo or video"
			class="aspect-(--photo-grid-aspect)"
			onclick={addMedia}
		/>
		{#each Array(uploadingCount)}
			<MediaImage
				src={null}
				pending
				class="aspect-(--photo-grid-aspect)"
			/>
		{/each}
	{/snippet}
	{#snippet tile(item, index)}
		{@const isSelected = selected.has(item.id)}
		<MediaTile
			{item}
			{index}
			selected={isSelected}
			clickable={selected.canSelectMore || isSelected}
			busy={deleting.has(item.id)}
			lifted={menu.isLifted(item.id)}
			onclick={() => toggleSelected(item.id)}
			onMenu={(tile) => menu.open({ key: item.id, item, tile })}
		/>
	{/snippet}
</MediaGrid>

{#if menu.current}
	{@const { item, tile } = menu.current}
	<MediaTileMenu
		{tile}
		video={isVideo(item)}
		selected={selected.has(item.id)}
		onDelete={() => (deleteTarget = item)}
		onClose={() => menu.close()}
	>
		{#snippet overlay()}
			{#if item.used}
				<SentOverlay />
			{/if}
		{/snippet}
	</MediaTileMenu>
{/if}

<DeleteMediaDialog
	bind:target={deleteTarget}
	video={isVideo}
	onConfirm={(item) => void deletePermanently(item)}
/>
