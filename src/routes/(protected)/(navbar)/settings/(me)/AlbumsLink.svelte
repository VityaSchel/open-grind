<script lang="ts">
	import { CaretRightIcon, FolderOpenIcon } from "phosphor-svelte";

	import { getMyAlbums } from "$lib/api/messaging/albums";
	import { albumCoverContent } from "$lib/components/album/album";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { proxyMediaUrl } from "$lib/util/media";

	const cover = getMyAlbums()
		.then(
			({ albums }) =>
				albumCoverContent(albums.flatMap((album) => album.content))
					?.thumbUrl,
		)
		.catch((error: unknown) => {
			console.error(error);
			return undefined;
		});
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a
			href="/albums"
			{...props}
			class={["rounded-full", props.class, "flex-nowrap!"]}
		>
			<Item.Media class="size-10 overflow-hidden rounded-full">
				{#await cover}
					<Skeleton class="size-full rounded-full" />
				{:then thumbUrl}
					{#if thumbUrl === undefined}
						<FolderOpenIcon weight="fill" class="size-5" />
					{:else}
						<MediaImage
							src={proxyMediaUrl(thumbUrl)}
							class="size-full rounded-full"
							size="md"
						/>
					{/if}
				{/await}
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
