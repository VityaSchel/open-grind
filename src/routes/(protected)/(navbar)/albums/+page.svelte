<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { getMyAlbums } from "$lib/api/messaging/albums";
	import AlbumTile from "$lib/components/album/AlbumTile.svelte";
	import MediaGrid from "$lib/components/shared/MediaGrid.svelte";
	import type { MyAlbum } from "$lib/model/messaging/albums";

	let albums = $state<MyAlbum[] | null>(null);
	let error = $state<unknown>(null);

	async function load() {
		albums = null;
		error = null;
		try {
			albums = (await getMyAlbums()).albums;
		} catch (caught) {
			console.error(caught);
			error = caught;
		}
	}

	void load();
</script>

<svelte:head>
	<title>My albums</title>
</svelte:head>

<MediaGrid
	items={albums}
	key={(album) => album.albumId}
	empty={false}
	{error}
	onRetry={() => void load()}
	skeletons={8}
	gridClass="[--photo-grid-aspect:3/4]"
>
	{#snippet leading()}
		<a
			href="/albums/new"
			class="flex aspect-(--photo-grid-aspect) cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground"
		>
			<PlusIcon weight="bold" class="size-6" />
			<span class="text-xs font-medium">Add album</span>
		</a>
	{/snippet}
	{#snippet tile(album)}
		<AlbumTile {album} href="/albums/{album.albumId}" />
	{/snippet}
</MediaGrid>
