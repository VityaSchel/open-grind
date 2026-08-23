<script lang="ts">
	import { untrack } from "svelte";

	import AgeFilterSlider from "$lib/components/filters/age/AgeFilterSlider.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import {
		ageRangeLabel,
		defaultFilters,
	} from "$lib/model/browse/grid/filters";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let { open = $bindable() }: { open: boolean } = $props();

	let filters = $state(gridState.filters.snapshot());
	let { ageEnabled: enabled, age: value } = $derived(filters);

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

	const label = $derived(ageRangeLabel(value));
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="mx-auto max-w-160">
		<Drawer.Header class="flex flex-row items-center justify-between">
			<div class="flex flex-1 justify-start">
				<Button
					variant="link"
					class="cursor-pointer"
					onclick={() => {
						value = defaultFilters.age;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Age</Drawer.Title>
			<div class="flex flex-1 justify-end">
				<Switch aria-label="Filter by age" bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<Drawer.Body class="mb-2 flex flex-col gap-1.5 px-4">
			<div class="mb-2 w-full text-center">{label}</div>
			<AgeFilterSlider
				bind:value={
					() => value,
					(v: number[]) => {
						enabled = true;
						value = v;
					}
				}
			/>
		</Drawer.Body>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					gridState.filters.set({ ageEnabled: enabled, age: value });
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
