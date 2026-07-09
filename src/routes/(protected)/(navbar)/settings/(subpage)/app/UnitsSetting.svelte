<script lang="ts">
	import { onMount } from "svelte";

	import {
		getPreferences,
		getUnitsSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import * as Item from "$lib/components/ui/item";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { UnitSystem } from "$lib/util/units";

	let value = $state<UnitSystem>(getUnitsSnapshot());

	onMount(() => {
		void getPreferences()
			.then(({ units }) => {
				value = units;
			})
			.catch((error) => {
				console.error("Failed to load preferences", error);
			});
	});
</script>

<Item.Root variant="outline" class="p-4 gap-3">
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
				value = units;
				setPreferences({ units }).catch((error) => {
					console.error("Failed to save preferences", error);
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
