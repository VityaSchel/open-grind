<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import { showErrorToast } from "$lib/api/error";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import * as Command from "$lib/components/ui/command";
	import { commandCenterClose } from "../command-center-state.svelte";

	let {
		geohash,
	}: {
		geohash: string | null;
	} = $props();

	async function setLocation(geohash: string) {
		try {
			await setPreferences({ geohash });
			await goto("/", { replaceState: page.url.pathname === "/" });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to save location",
				error,
			});
		}
	}
</script>

<Command.Item
	value={geohash === null ? "@" : `@${geohash}`}
	disabled={geohash === null || geohash.length !== 12}
	class={geohash === null ? "text-muted-foreground" : "gap-0 font-mono"}
	onSelect={() => {
		if (geohash === null || geohash.length !== 12) return;
		void setLocation(geohash);
		commandCenterClose();
	}}
>
	{#if geohash === null}
		Put the 12-character geohash to set your location
	{:else}
		@{#each Array.from(geohash) as char}
			<span class="w-2.25">{char}</span>
		{/each}
		{#each Array(12 - geohash.length)}
			<span class="h-px w-2 ms-px bg-muted-foreground self-end"></span>
		{/each}
	{/if}
</Command.Item>
