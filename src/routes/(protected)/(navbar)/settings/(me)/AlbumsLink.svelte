<script lang="ts">
	import { CaretRightIcon, FolderOpenIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import { getMyAlbumsState } from "$lib/albums/my-albums-state.svelte";
	import { albumCoverContent } from "$lib/components/album/album";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { proxyMediaUrl } from "$lib/util/media";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const myAlbums = untrack(() => getMyAlbumsState(ourProfileId));

	const loading = $derived(
		myAlbums.albums === null && myAlbums.error === null,
	);
	const thumbUrl = $derived(
		myAlbums.albums &&
			albumCoverContent(myAlbums.albums.flatMap((album) => album.content))
				?.thumbUrl,
	);

	void myAlbums.refresh();
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a
			href="/settings/albums"
			{...props}
			class={["rounded-full", props.class, "flex-nowrap!"]}
		>
			<Item.Media class="size-10 overflow-hidden rounded-full">
				{#if loading}
					<Skeleton class="size-full rounded-full" />
				{:else if !thumbUrl}
					<span
						class="flex size-full items-center justify-center rounded-full bg-card-foreground/15 text-muted-foreground"
					>
						<FolderOpenIcon weight="fill" class="size-5" />
					</span>
				{:else}
					<MediaImage
						src={proxyMediaUrl(thumbUrl)}
						class="size-full rounded-full"
						size="md"
					/>
				{/if}
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title
					class="inline-block w-full min-w-0 truncate text-left"
				>
					My Albums
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
