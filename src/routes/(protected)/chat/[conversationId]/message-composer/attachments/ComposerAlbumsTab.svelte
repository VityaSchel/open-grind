<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";
	import VideoIcon from "phosphor-svelte/lib/VideoIcon";
	import { toast } from "svelte-sonner";

	import { getMyAlbums, shareAlbum } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { proxyMediaUrl } from "$lib/util/media";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { MyAlbum } from "$lib/model/messaging/albums";
	import { getConversationState } from "../../conversation-state.svelte";

	let {
		onClose,
		onSelectionChange,
	}: { onClose: () => void; onSelectionChange: (count: number) => void } =
		$props();

	const conversationState = $derived(getConversationState()());
	const selected = new SelectionSet<number>(10);

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);

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

	function toggleSelected(albumId: number) {
		selected.toggle(albumId);
		onSelectionChange(selected.size);
	}

	export function sendSelected() {
		const profileId = conversationState.profile?.profileId;
		if (albums === null || profileId === undefined) return;
		const albumIds = selected.values();
		selected.clear();
		onSelectionChange(0);
		onClose();
		for (const albumId of albumIds) {
			shareAlbum({ albumId, profileIds: [profileId] }).catch(
				(err: unknown) => {
					console.error(err);
					toast.error("Couldn't share album");
				},
			);
		}
	}
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => void load()}
				class="m-auto"
			/>
		</div>
	{:else if albums === null}
		<div class="photo-grid [--photo-grid-aspect:3/4]">
			{#each Array(9)}
				<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
			{/each}
		</div>
	{:else if albums.length === 0}
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
	{:else}
		<div class="photo-grid [--photo-grid-aspect:3/4]">
			{#each albums as album (album.albumId)}
				{@const isSelected = selected.has(album.albumId)}
				{@const hasVideo = album.content.some((item) =>
					item.contentType.startsWith("video/"),
				)}
				<button
					type="button"
					data-slot="album-tile"
					class={[
						"relative isolate flex aspect-(--photo-grid-aspect) items-end overflow-hidden",
						{
							"cursor-pointer":
								album.isShareable &&
								(selected.canSelectMore || isSelected),
						},
					]}
					aria-pressed={isSelected}
					disabled={!album.isShareable}
					onclick={() => toggleSelected(album.albumId)}
				>
					<MediaImage
						src={proxyMediaUrl(album.content[0]?.thumbUrl)}
						loading="lazy"
						class="absolute inset-0 size-full rounded-[inherit]"
						imgClass="bg-card-foreground/10"
					/>
					<div class="z-1 flex w-full items-center p-1.5">
						<Badge
							variant="outline"
							class="min-w-0 bg-popover/20 backdrop-blur-2xl"
						>
							<span class="truncate font-semibold">
								{album.albumName || "Untitled album"}
							</span>
						</Badge>
					</div>
					<div
						class="absolute inset-s-1.5 top-1.5 z-1 flex gap-1 text-2xs font-semibold *:flex *:h-6 *:min-w-6 *:items-center *:justify-center *:gap-1 *:rounded-full *:border *:border-white/10 *:bg-popover/40 *:backdrop-blur-2xl"
					>
						<div class="px-1.5">
							<ImagesIcon weight="fill" class="size-3.5" />
							{album.content.length}<span class="sr-only">
								{album.content.length === 1 ? "item" : "items"}
							</span>
						</div>
						{#if hasVideo}
							<div>
								<VideoIcon weight="fill" class="size-3.5" />
								<span class="sr-only">contains video</span>
							</div>
						{/if}
					</div>
					{#if isSelected}
						<div
							class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
						>
							<SelectionCheck />
						</div>
					{:else if !album.isShareable}
						<div
							class="absolute inset-0 z-2 flex items-center justify-center rounded-[inherit] bg-black/60 text-white"
						>
							<LockSimpleIcon weight="fill" class="size-6" />
							<span class="sr-only">can't be shared</span>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	<div role="status" class="sr-only">
		{selected.size === selected.max
			? `Maximum ${selected.max} selected`
			: ""}
	</div>
</div>
