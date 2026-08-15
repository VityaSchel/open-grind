<script lang="ts">
	import { untrack } from "svelte";
	import type z from "zod";

	import PositionFilterToggle from "$lib/components/filters/position/PositionFilterToggle.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { defaultFilters } from "$lib/model/browse/grid/filters";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import type { filterPositionSchema } from "$lib/model/browse/grid/filters";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());
	let { positionEnabled: enabled, positions: value } = $derived(filters);

	$effect(() => {
		if (open) {
			filters = untrack(() => gridState.filters.snapshot());
		}
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		preventOverflowTextSelection={false}
		class="mx-auto max-w-160"
	>
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => {
						value = defaultFilters.positions;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Positions</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch
					aria-label="Filter by position"
					bind:checked={enabled}
				/>
			</div>
		</Drawer.Header>
		<div class="mb-2 flex flex-col gap-1.5 px-4">
			<PositionFilterToggle
				bind:value={
					() => value,
					(v: z.infer<typeof filterPositionSchema>) => {
						enabled = true;
						value = v;
					}
				}
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					gridState.filters.set({
						positionEnabled: enabled,
						positions: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
