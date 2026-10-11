<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import * as Command from "$lib/components/ui/command";
	import { t } from "$lib/i18n";
	import { formatInteger } from "$lib/i18n/format";
	import Rich from "$lib/i18n/Rich.svelte";
	import { GEOHASH_PRECISION } from "$lib/model/geohash";
	import { commandCenterClose } from "../command-center-state.svelte";

	let {
		geohash,
		currentGeohash,
	}: { geohash: string | null; currentGeohash: string | null } = $props();

	const geohashToCopy = $derived(geohash === null ? currentGeohash : null);
	const geohashToSet = $derived(
		geohash !== null && geohash.length === GEOHASH_PRECISION
			? geohash
			: null,
	);

	async function setLocation(geohash: string) {
		try {
			await setPreferences({ geohash });
			await goto("/", { replaceState: page.url.pathname === "/" });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("common.location.errors.saveFailed"),
				error,
			});
		}
	}

	async function copyLocation(geohash: string) {
		try {
			await writeText(geohash);
			toast.success(t("feedback.errorCopy.copied"));
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("commands.setLocationByGeohash.errors.copyFailed"),
				error,
			});
		}
	}

	function select() {
		if (geohashToCopy !== null) void copyLocation(geohashToCopy);
		else if (geohashToSet !== null) void setLocation(geohashToSet);
		else return;
		commandCenterClose();
	}
</script>

{#snippet selectedGeohash()}
	<span class="font-mono" translate="no">{geohashToCopy}</span>
{/snippet}

<Command.Item
	value={geohashToCopy === null ? `@${geohash ?? ""}` : "@copy"}
	disabled={geohashToCopy === null && geohashToSet === null}
	class={{
		"text-muted-foreground": geohashToCopy === null && geohash === null,
		"gap-0 font-mono": geohash !== null,
	}}
	translate={geohash === null ? undefined : "no"}
	onSelect={select}
>
	{#if geohashToCopy !== null}
		<span>
			<Rich
				key="commands.setLocationByGeohash.copyCurrent"
				geohash={selectedGeohash}
			/>
		</span>
	{:else if geohash === null}
		{t("commands.setLocationByGeohash.hint", {
			length: formatInteger(GEOHASH_PRECISION),
		})}
	{:else}
		@{#each Array.from(geohash) as char, i (i)}
			<span class="w-2.25">{char}</span>
		{/each}
		{#each Array(GEOHASH_PRECISION - geohash.length)}
			<span class="ms-px h-px w-2 self-end bg-muted-foreground"></span>
		{/each}
	{/if}
</Command.Item>
