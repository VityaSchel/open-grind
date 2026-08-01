<script lang="ts">
	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import * as Item from "$lib/components/ui/item";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { UnitSystem } from "$lib/util/units";

	let pending = $state<UnitSystem | null>(null);
	const value = $derived(pending ?? getPreferencesSnapshot().units);
</script>

<Item.Root variant="outline" class="gap-3 p-4">
	<Item.Content class="gap-1">
		<Item.Title>Units</Item.Title>
		<Item.Description>
			Choose how distance, height, and weight are displayed.
		</Item.Description>
	</Item.Content>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		class="w-full"
		bind:value={
			() => value,
			(next: string) => {
				const units = (next || "metric") as UnitSystem;
				pending = units;
				setPreferences({ units }).catch((error) => {
					pending = null;
					showErrorToast({ label: "Failed to save preferences", error });
				});
			}
		}
	>
		<ToggleGroup.Item value="metric" class="flex-1 justify-center">
			Metric
		</ToggleGroup.Item>
		<ToggleGroup.Item value="imperial" class="flex-1 justify-center">
			Imperial
		</ToggleGroup.Item>
	</ToggleGroup.Root>
</Item.Root>
