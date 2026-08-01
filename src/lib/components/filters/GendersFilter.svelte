<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { type TransitionConfig } from "svelte/transition";

	import { getGenders } from "$lib/api/users/genders";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import FilterBoolean from "./FilterBoolean.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: {
		checked: boolean;
		value: number[];
	} = $props();

	const genders = $derived(
		getGenders().then((genders) =>
			genders
				.filter((g) => g.displayGroup > 0)
				.sort((a, b) => (a.sortFilter ?? 1) - (b.sortFilter ?? 1)),
		),
	);

	const hide = (node: HTMLDivElement): TransitionConfig => {
		const width = node.offsetWidth;
		return {
			duration: 400,
			css: (t: number, u: number) =>
				`width: calc(${t} * ${width}px); opacity: ${t}; margin-left: calc(${u} * -4px)`,
			easing: expoOut,
		};
	};

	let expanded = $state(false);
</script>

<div class="flex min-w-0 flex-col gap-2">
	<FilterBoolean id="gender" bind:checked>Gender</FilterBoolean>
	<div class="ps-6">
		{#await genders}
			<Spinner />
		{:then genders}
			<ToggleGroup.Root
				type="multiple"
				variant="outline"
				spacing={2}
				class="w-full flex-wrap gap-1"
				bind:value={
					() => value.map(String),
					(v: string[]) => ((checked = v.length > 0), (value = v.map(Number)))
				}
			>
				{#each genders as { genderId, gender, excludeOnFilterSelection: excludeList, genderPlural, displayGroup } (genderId)}
					{@const render =
						!excludeList ||
						(!value.some((v) => excludeList.includes(v)) &&
							(expanded || displayGroup === 1))}
					{#if render}
						<div transition:hide class="overflow-clip">
							<ToggleGroup.Item value={String(genderId)}>
								{genderPlural ?? gender}
							</ToggleGroup.Item>
						</div>
					{/if}
				{/each}
				<ToggleGroup.Item value="-1">Not specified</ToggleGroup.Item>
				<Button variant="secondary" onclick={() => (expanded = !expanded)}>
					{#if expanded}
						Less
					{:else}
						More
					{/if}
				</Button>
			</ToggleGroup.Root>
		{:catch}
			<div class="text-sm text-destructive">Failed to load genders</div>
		{/await}
	</div>
</div>
