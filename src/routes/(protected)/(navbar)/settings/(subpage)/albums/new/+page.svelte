<script lang="ts">
	import { getMyAlbumsState } from "$lib/albums/my-albums-state.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { t } from "$lib/i18n";
	import { receiveMedia } from "$lib/platform/media-intake.svelte";
	import type { PickedMedia } from "$lib/platform/media-picker";
	import AlbumHeaderLayout from "../album-editor/AlbumHeaderLayout.svelte";
	import AlbumMediaEmpty from "../album-editor/AlbumMediaEmpty.svelte";
	import AlbumNameField from "../album-editor/AlbumNameField.svelte";
	import { getAlbumUploads } from "../album-uploads/album-uploads-state.svelte";
	import { createAlbumFromMedia } from "./create-album-media";

	const { data }: import("./$types").PageProps = $props();

	let albumName = $state("");
	let creating = $state(false);

	async function add(media?: PickedMedia[]) {
		creating = true;
		try {
			const name = albumName.trim();
			await createAlbumFromMedia({
				uploads: getAlbumUploads(data.ourProfileId),
				myAlbums: getMyAlbumsState(data.ourProfileId),
				albumName: name === "" ? null : name,
				media,
			});
		} finally {
			creating = false;
		}
	}

	receiveMedia(() =>
		creating
			? null
			: {
					label: t("media.albums.new.dropToStart"),
					videos: true,
					receive: (media) => void add(media),
				},
	);
</script>

<svelte:head>
	<title>{t("settings.subpage.titles.newAlbum")}</title>
</svelte:head>

<AlbumHeaderLayout>
	{#snippet preview()}
		<MediaImage src={null} class="aspect-3/4 w-full rounded-xl" />
	{/snippet}
	<AlbumNameField bind:value={albumName} disabled={creating} />
</AlbumHeaderLayout>
<AlbumMediaEmpty
	title={t("media.albums.new.empty.title")}
	description={t("media.albums.new.empty.description")}
	disabled={creating}
	onAdd={() => void add()}
/>
