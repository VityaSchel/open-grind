<script lang="ts">
	import { page } from "$app/state";

	import { getAlbumContent } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import AlbumEditor from "../album-editor/AlbumEditor.svelte";

	const albumId = $derived(Number(page.params.albumId));

	let attempt = $state(0);

	async function loadAlbum(request: { albumId: number; attempt: number }) {
		return await getAlbumContent(request.albumId);
	}

	const album = $derived(loadAlbum({ albumId, attempt }));
</script>

<svelte:head>
	<title>Edit album</title>
</svelte:head>

{#await album}
	<Skeleton class="mx-auto aspect-3/4 w-32 max-w-full rounded-xl" />
	<Skeleton class="h-9 w-full rounded-full" />
	<Skeleton class="h-11 w-full rounded-4xl" />
	<Skeleton class="h-4 w-full" />
	<div class="grid grid-cols-3 gap-2">
		{#each Array(3)}
			<Skeleton class="aspect-square rounded-xl" />
		{/each}
	</div>
{:then loaded}
	{#key loaded.albumId}
		<AlbumEditor album={loaded} />
	{/key}
{:catch error}
	<ApiErrorDisplay
		{error}
		onRetry={() => (attempt += 1)}
		class="m-auto py-8"
	/>
{/await}
