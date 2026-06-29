<script lang="ts">
	import AgeFilterSlider from "$lib/components/filters/age/AgeFilterSlider.svelte";
	import { defaultFilters } from "$lib/components/filters/filters";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import { Switch } from "$lib/components/ui/switch";
	import { gridState } from "$lib/grid/grid-state.svelte";

	let {
		open = $bindable(),
	}: {
		open: boolean;
	} = $props();

	let filters = $derived({ ...(gridState.filters.value ?? defaultFilters) });
	let { ageEnabled: enabled, age: value } = $derived(filters);

	$effect(() => {
		if (open) {
			filters = { ...(gridState.filters.value ?? defaultFilters) };
		}
	});

	let label = $state("");
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
						value = defaultFilters.age;
					}}
				>
					Reset
				</Button>
			</div>
			<Drawer.Title>Age</Drawer.Title>
			<div class="flex-1 flex justify-end">
				<Switch id="age-filter-enabled" bind:checked={enabled} />
			</div>
		</Drawer.Header>
		<div class="px-4 flex flex-col gap-1.5 mb-2">
			<div class="w-full text-center mb-2">{label}</div>
			<AgeFilterSlider
				bind:value={
					() => value,
					(v: number[]) => {
						enabled = true;
						value = v;
					}
				}
				bind:label
			/>
		</div>
		<Drawer.Footer>
			<Drawer.Close
				class={buttonVariants({ variant: "default" })}
				onclick={() => {
					gridState.filters.set({
						ageEnabled: enabled,
						age: value,
					});
					open = false;
				}}
			>
				Apply
			</Drawer.Close>
		</Drawer.Footer>
	</Drawer.Content>
</Drawer.Root>
