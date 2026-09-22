<script lang="ts">
	import { page } from "$app/state";

	import { getAlbumContent } from "$lib/api/messaging/albums";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import AlbumEditor from "../album-editor/AlbumEditor.svelte";
	import AlbumHeaderLayout from "../album-editor/AlbumHeaderLayout.svelte";

	const { data }: import("./$types").PageProps = $props();

	const albumId = $derived(Number(page.params.albumId));

	let attempt = $state(0);

	const album = $derived.by(() => {
		void attempt;
		return getAlbumContent(albumId);
	});
</script>

<svelte:head>
	<title>Edit album</title>
</svelte:head>

{#await album}
	<AlbumHeaderLayout>
		{#snippet preview()}
			<Skeleton class="aspect-3/4 w-full rounded-xl" />
		{/snippet}
		<div class="flex flex-col gap-1.5">
			<Skeleton class="h-9 w-full rounded-full" />
			<Skeleton class="h-4 w-40" />
		</div>
		<Skeleton class="mt-1 h-11 w-full rounded-4xl" />
		<Skeleton class="h-4 w-full" />
	</AlbumHeaderLayout>
	<div class="grid grid-cols-3 gap-2">
		{#each Array(3)}
			<Skeleton class="aspect-square rounded-xl" />
		{/each}
	</div>
{:then loaded}
	{#key loaded.albumId}
		<AlbumEditor album={loaded} ourProfileId={data.ourProfileId} />
	{/key}
{:catch error}
	<ApiErrorDisplay
		{error}
		onRetry={() => (attempt += 1)}
		class="m-auto py-8"
	/>
{/await}
