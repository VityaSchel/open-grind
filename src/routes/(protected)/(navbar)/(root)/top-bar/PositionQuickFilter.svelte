<script lang="ts">
	import type z from "zod";

	import {
		defaultFilters,
		filterPositionSchema,
	} from "$lib/components/filters/filters";
	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";

	let {
		open = $bindable(),
		enabled = $bindable(),
		value = $bindable(),
		onUpdateFilters,
	}: {
		open: boolean;
		enabled: boolean;
		value: z.infer<typeof filterPositionSchema>;
		onUpdateFilters: () => void;
	} = $props();

	let filtersChanges: {
		positions: z.infer<typeof filterPositionSchema>;
		positionEnabled: boolean;
	} = $state({
		positions: defaultFilters.positions,
		positionEnabled: defaultFilters.positionEnabled,
	});

	$effect(() => {
		if (open) {
			filtersChanges.positions = value;
			filtersChanges.positionEnabled = enabled;
		}
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="max-w-160 mx-auto"
	>
		<Drawer.Header class="flex flex-row justify-between items-center">
			<div class="flex-1 flex justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => {
						filtersChanges.positions = defaultFilters.positions;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Positions</Drawer.Title>
			<div class="flex-1 flex justify-end">
				<Switch
					id="positions-filter-enabled"
					bind:checked={filtersChanges.positionEnabled}
				/>
			</div>
		</Drawer.Header>
		<div class="px-4 flex flex-col gap-1.5 mb-2">
			<PositionFilterToggle
				bind:value={
					() => filtersChanges.positions,
					(v: z.infer<typeof filterPositionSchema>) => {
						filtersChanges.positionEnabled = true;
						filtersChanges.positions = v;
					}
				}
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					value = filtersChanges.positions;
					enabled = filtersChanges.positionEnabled;
					onUpdateFilters();
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
