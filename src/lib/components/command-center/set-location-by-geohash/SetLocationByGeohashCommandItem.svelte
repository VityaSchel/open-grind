<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import * as Command from "$lib/components/ui/command";
	import { commandCenterClose } from "../command-center-state.svelte";

	let {
		geohash,
		currentGeohash,
	}: { geohash: string | null; currentGeohash: string | null } = $props();

	const geohashToCopy = $derived(geohash === null ? currentGeohash : null);
	const geohashToSet = $derived(
		geohash !== null && geohash.length === 12 ? geohash : null,
	);

	async function setLocation(geohash: string) {
		try {
			await setPreferences({ geohash });
			await goto("/", { replaceState: page.url.pathname === "/" });
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}

	async function copyLocation(geohash: string) {
		try {
			await writeText(geohash);
			toast.success("Location copied to clipboard");
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to copy location", error });
		}
	}

	function select() {
		if (geohashToCopy !== null) void copyLocation(geohashToCopy);
		else if (geohashToSet !== null) void setLocation(geohashToSet);
		else return;
		commandCenterClose();
	}
</script>

<Command.Item
	value={geohashToCopy === null ? `@${geohash ?? ""}` : "@copy"}
	disabled={geohashToCopy === null && geohashToSet === null}
	class={{
		"text-muted-foreground": geohashToCopy === null && geohash === null,
		"gap-0 font-mono": geohash !== null,
	}}
	onSelect={select}
>
	{#if geohashToCopy !== null}
		<span>
			Copy currently selected location:
			<span class="font-mono">{geohashToCopy}</span>
		</span>
	{:else if geohash === null}
		Enter the 12-character geohash to set your location
	{:else}
		@{#each Array.from(geohash) as char, i (i)}
			<span class="w-2.25">{char}</span>
		{/each}
		{#each Array(12 - geohash.length)}
			<span class="ms-px h-px w-2 self-end bg-muted-foreground"></span>
		{/each}
	{/if}
</Command.Item>
