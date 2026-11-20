<script lang="ts">
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import { getMyAlbumsState } from "#lib/albums/my-albums-state.svelte.ts";
	import AlbumTile from "#lib/components/album/AlbumTile.svelte";
	import AddTile, {
		ADD_TILE_KEY,
	} from "#lib/components/shared/AddTile.svelte";
	import MediaGrid from "#lib/components/shared/MediaGrid.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";

	const { data }: import("./$types").PageProps = $props();

	const myAlbums = untrack(() => getMyAlbumsState(data.ourProfileId));
	const tiles = new RovingFocusState({
		keys: () => [
			...(atAlbumCap ? [] : [ADD_TILE_KEY]),
			...(myAlbums.albums ?? []).map(({ albumId }) => albumId),
		],
		orientation: "grid",
		wrap: "rows",
		openerScope: page.url.pathname,
	});

	const atAlbumCap = $derived(
		myAlbums.albums !== null &&
			myAlbums.maxAlbums !== null &&
			myAlbums.albums.length >= myAlbums.maxAlbums,
	);

	void myAlbums.refresh();
</script>

<MediaGrid
	items={myAlbums.albums}
	key={(album) => album.albumId}
	empty={false}
	error={myAlbums.error}
	onRetry={() => void myAlbums.reload()}
	skeletons={8}
	roving={tiles}
	gridClass="[--photo-grid-aspect:3/4]"
>
	{#snippet leading()}
		{#if !atAlbumCap}
			<AddTile
				href="/settings/albums/new"
				label={t("media.albums.add")}
				class="aspect-(--photo-grid-aspect)"
				attach={tiles.item(ADD_TILE_KEY)}
			/>
		{/if}
	{/snippet}
	{#snippet tile(album)}
		<AlbumTile
			{album}
			href="/settings/albums/{album.albumId}"
			attach={tiles.item(album.albumId)}
		/>
	{/snippet}
</MediaGrid>
