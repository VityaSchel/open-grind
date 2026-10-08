<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { type TransitionConfig } from "svelte/transition";

	import { getGenders } from "$lib/api/users/genders";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { t } from "$lib/i18n";
	import { isFilterableGender } from "$lib/model/browse/grid/filters";
	import { instantWhenReducedMotion } from "$lib/util/reduced-motion";
	import FilterBoolean from "./FilterBoolean.svelte";
	import { isGenderChipShown, selectGenders } from "./gender-chips";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	const genders = $derived(
		getGenders().then((genders) =>
			genders
				.filter(isFilterableGender)
				.sort((a, b) => a.sortFilter - b.sortFilter),
		),
	);

	const hide = instantWhenReducedMotion(
		(node: HTMLDivElement): TransitionConfig => {
			const width = node.offsetWidth;
			return {
				duration: 400,
				css: (t: number, u: number) =>
					`width: calc(${t} * ${width}px); opacity: ${t}; margin-left: calc(${u} * -4px)`,
				easing: expoOut,
			};
		},
	);

	let expanded = $state(false);
</script>

<div class="flex min-w-0 flex-col gap-2">
	<FilterBoolean id="gender" bind:checked>
		{t("browse.filters.genders.label")}
	</FilterBoolean>
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
					(next: string[]) => {
						value = selectGenders({
							genders,
							previous: value,
							next: next.map(Number),
						});
						checked = value.length > 0;
					}
				}
			>
				{#each genders as gender (gender.genderId)}
					{@const shown = isGenderChipShown({
						gender,
						selected: value,
						expanded,
					})}
					{#if shown}
						<div transition:hide class="overflow-clip">
							<ToggleGroup.Item value={String(gender.genderId)}>
								{gender.genderPlural ?? gender.gender}
							</ToggleGroup.Item>
						</div>
					{/if}
				{/each}
				<ToggleGroup.Item value="-1">
					{t("common.filters.notSpecified")}
				</ToggleGroup.Item>
				<Button
					variant="secondary"
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						{t("browse.filters.less")}
					{:else}
						{t("browse.filters.more")}
					{/if}
				</Button>
			</ToggleGroup.Root>
		{:catch}
			<div class="text-sm text-destructive">
				{t("common.genders.errors.loadFailed")}
			</div>
		{/await}
	</div>
</div>
