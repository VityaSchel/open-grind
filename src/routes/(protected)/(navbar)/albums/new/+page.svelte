<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import AlbumHeaderLayout from "../album-editor/AlbumHeaderLayout.svelte";
	import AlbumMediaEmpty from "../album-editor/AlbumMediaEmpty.svelte";
	import AlbumNameField from "../album-editor/AlbumNameField.svelte";
	import { getAlbumUploads } from "../album-uploads/album-uploads-state.svelte";
	import { createAlbumFromMedia } from "./create-album-media";

	const { data }: import("./$types").PageProps = $props();

	let albumName = $state("");
	let creating = $state(false);

	async function add() {
		creating = true;
		try {
			const name = albumName.trim();
			await createAlbumFromMedia({
				uploads: getAlbumUploads(data.ourProfileId),
				albumName: name === "" ? null : name,
			});
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>New album</title>
</svelte:head>

<AlbumHeaderLayout>
	{#snippet preview()}
		<MediaImage src={null} class="aspect-3/4 w-full rounded-xl" />
	{/snippet}
	<AlbumNameField bind:value={albumName} disabled={creating} />
</AlbumHeaderLayout>
<AlbumMediaEmpty
	title="Add a photo to start your album"
	description="The album is created once you add its first photo or video."
	disabled={creating}
	onAdd={() => void add()}
/>
