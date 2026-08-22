<script lang="ts">
	import { GpsFixIcon } from "phosphor-svelte";

	import Button from "$lib/components/ui/button/button.svelte";
	import { reportLocationFailure } from "$lib/location/location-feedback";
	import { locationRequest } from "$lib/location/location-request.svelte";

	let { onlocate }: { onlocate: (at: { lat: number; lon: number }) => void } =
		$props();

	let locating = $state(false);

	async function locate() {
		locating = true;
		try {
			const outcome = await locationRequest.run();
			if (outcome.status === "ok") onlocate(outcome.coords);
			else reportLocationFailure(outcome);
		} finally {
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
		<GpsFixIcon weight="fill" class="size-6" />
	</Button>
</div>
