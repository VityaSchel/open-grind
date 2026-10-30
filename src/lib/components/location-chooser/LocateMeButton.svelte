<script lang="ts">
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import { onDestroy } from "svelte";

	import { isHalloween } from "$lib/components/halloween/halloween";
	import ReticuleIcon from "$lib/components/halloween/ReticuleIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { reportLocationFailure } from "$lib/location/location-feedback";
	import { locationRequest } from "$lib/location/location-request.svelte";

	let { onlocate }: { onlocate: (at: { lat: number; lon: number }) => void } =
		$props();

	let locating = $state(false);
	let generation: number | undefined;
	let mounted = true;
	onDestroy(() => {
		mounted = false;
		if (generation !== undefined) locationRequest.abortStale(generation);
	});

	async function locate() {
		locating = true;
		try {
			const request = locationRequest.run();
			generation = locationRequest.generation;
			const outcome = await request;
			if (!mounted) return;
			if (outcome.status === "ok") onlocate(outcome.coords);
			else reportLocationFailure(outcome);
		} finally {
			generation = undefined;
			locating = false;
		}
	}
</script>

<div class="absolute right-2 bottom-6 z-1010 rounded-full">
	<Button
		size="icon-lg"
		aria-label="Locate me"
		variant="default"
		class="cursor-pointer bg-white text-black shadow-sm hover:bg-neutral-100"
		disabled={locating}
		onclick={locate}
	>
		{#if isHalloween()}
			<ReticuleIcon class="size-6" />
		{:else}
			<GpsFixIcon weight="fill" class="size-6" />
		{/if}
	</Button>
</div>
