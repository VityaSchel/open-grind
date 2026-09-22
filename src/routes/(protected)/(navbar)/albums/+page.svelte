<script lang="ts">
	import {
		getAlbumStorageLimits,
		getMyAlbums,
	} from "$lib/api/messaging/albums";
	import AlbumTile from "$lib/components/album/AlbumTile.svelte";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaGrid from "$lib/components/shared/MediaGrid.svelte";
	import type { MyAlbum } from "$lib/model/messaging/albums";

	let albums = $state<MyAlbum[] | null>(null);
	let maxAlbums = $state<number | null>(null);
	let error = $state<unknown>(null);

	const atAlbumCap = $derived(
		albums !== null && maxAlbums !== null && albums.length >= maxAlbums,
	);

	async function loadMaxAlbums(): Promise<number | null> {
		try {
			return (await getAlbumStorageLimits()).maxAlbums;
		} catch (caught) {
			console.error(caught);
			return null;
		}
	}

	async function load() {
		albums = null;
		error = null;
		try {
			const [mine, max] = await Promise.all([
				getMyAlbums(),
				loadMaxAlbums(),
			]);
			maxAlbums = max;
			albums = mine.albums;
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
		{#if !atAlbumCap}
			<AddTile
				href="/albums/new"
				label="Add album"
				class="aspect-(--photo-grid-aspect)"
			/>
		{/if}
	{/snippet}
	{#snippet tile(album)}
		<AlbumTile {album} href="/albums/{album.albumId}" />
	{/snippet}
</MediaGrid>
