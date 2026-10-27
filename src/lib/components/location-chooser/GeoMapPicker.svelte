<script lang="ts">
	import { Spinner } from "$lib/components/ui/spinner";
	import type { Coordinates } from "$lib/location/location-request.svelte";

	let {
		pinPos = $bindable(),
		locked = false,
		initialView,
	}: {
		pinPos?: Coordinates;
		locked?: boolean;
		initialView?: Coordinates & { zoom: number };
	} = $props();
</script>

{#await import("./GeoMap.svelte")}
	<div class="flex h-full items-center justify-center">
		<Spinner class="size-8" />
	</div>
{:then { default: GeoMap }}
	<GeoMap bind:pinPos {initialView} {locked} />
{/await}
