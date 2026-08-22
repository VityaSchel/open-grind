<script lang="ts">
	import { getPlaces } from "$lib/api/browse/location";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		onpick,
		clearsLocateButton = false,
	}: {
		onpick: (place: { lat: number; lon: number }) => void;
		clearsLocateButton?: boolean;
	} = $props();

	let query = $state("");
	let showResults = $state(false);

	const places = $derived.by(async () => {
		const trimmed = query.trim();
		if (!trimmed) return;
		return await getPlaces({ query: trimmed });
	});

	dismissOnBackGesture({
		active: () => showResults,
		dismiss: () => {
			showResults = false;
		},
	});
</script>

<div
	class={[
		"absolute bottom-4 z-1010 w-full p-2",
		{ "max-w-[calc(100%-2.5rem)]": clearsLocateButton },
	]}
>
	<Input
		id="search-place"
		type="search"
		placeholder="Search places..."
		bind:value={
			() => query,
			(value: string) => {
				query = value;
				showResults = value.length > 0;
			}
		}
		class="bg-popover-foreground text-background shadow-md"
		maxlength={100}
		onfocus={() => {
			if (query.trim()) showResults = true;
		}}
		onblur={() => {
			setTimeout(() => {
				showResults = false;
			}, 200);
		}}
	/>
</div>
{#if showResults}
	<div class="absolute top-0 left-0 z-1000 size-full p-1">
		<div
			class="flex h-full w-full flex-col gap-2 overflow-auto rounded-md bg-popover-foreground px-1 py-3 text-popover shadow-md backdrop-blur-xl"
		>
			{#await places}
				<Spinner class="m-auto size-8" />
			{:then response}
				{#if response}
					{#each response.places.toSorted((a, b) => b.importance - a.importance) as place (`${place.lat},${place.lon},${place.name}`)}
						<Button
							class="flex h-auto cursor-pointer flex-col items-start justify-start gap-0 text-left text-current"
							variant="link"
							onclick={() => {
								onpick({ lat: place.lat, lon: place.lon });
								showResults = false;
							}}
						>
							<span
								class="line-clamp-1 block max-w-full truncate"
							>
								{place.name}
							</span>
							<span
								class="line-clamp-1 block max-w-full truncate text-sm text-popover/40"
							>
								{place.address}
							</span>
						</Button>
					{/each}
				{/if}
			{:catch error}
				<ApiErrorDisplay
					{error}
					buttonVariant="secondary"
					class="m-auto"
				/>
			{/await}
		</div>
	</div>
{/if}
