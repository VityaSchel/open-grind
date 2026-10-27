<script lang="ts">
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import { onDestroy } from "svelte";

	import Button from "$lib/components/ui/button/button.svelte";
	import { t } from "$lib/i18n";
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
		aria-label={t("browse.locationChooser.a11y.locateMe")}
		variant="default"
		class="cursor-pointer bg-white text-black shadow-sm hover:bg-neutral-100"
		disabled={locating}
		onclick={locate}
	>
		<GpsFixIcon weight="fill" class="size-6" />
	</Button>
</div>
