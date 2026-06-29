<script lang="ts">
	import { SlidersHorizontalIcon } from "phosphor-svelte";

	import { defaultFilters } from "$lib/components/filters/filters";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import AgeQuickFilter from "./AgeQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";

	let {
		openFilters = $bindable(),
	}: {
		openFilters: {
			all: boolean;
			age: boolean;
			position: boolean;
		};
	} = $props();

	const BOOLEAN_FILTER_KEYS = [
		"isFavorite",
		"isOnline",
		"isRightNow",
		"isFresh",
	] as const;

	let filters = $derived({ ...(gridState.filters.value ?? defaultFilters) });
	const { ageEnabled, positionEnabled } = $derived(filters);
	let { isOnline, isRightNow, isFresh } = $derived(filters);
</script>

<Button variant="secondary" onclick={() => (openFilters.all = true)}>
	<SlidersHorizontalIcon />
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.age = true)}
	class={{
		"bg-white hover:bg-neutral-200 text-popover": ageEnabled,
	}}
>
	Age
</Button>
<Button
	variant="secondary"
	onclick={() => (openFilters.position = true)}
	class={{
		"bg-white hover:bg-neutral-200 text-popover": positionEnabled,
	}}
>
	Position
</Button>
<ToggleGroup.Root
	type="multiple"
	variant="default"
	bind:value={
		() => BOOLEAN_FILTER_KEYS.filter((value) => filters?.[value]),
		(values: (typeof BOOLEAN_FILTER_KEYS)[number][]) => {
			if (filters !== null) {
				BOOLEAN_FILTER_KEYS.forEach((key) => {
					filters[key] = values.includes(key);
				});
				gridState.filters.set({
					isOnline,
					isRightNow,
					isFresh,
				});
			}
		}
	}
	size="sm"
	class="h-9"
>
	<ToggleGroup.Item
		value="isOnline"
		class={buttonVariants({ variant: "secondary" })}
	>
		Online
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isRightNow"
		class={buttonVariants({ variant: "secondary" })}
	>
		Right now
	</ToggleGroup.Item>
	<ToggleGroup.Item
		value="isFresh"
		class={buttonVariants({ variant: "secondary" })}
	>
		Fresh
	</ToggleGroup.Item>
</ToggleGroup.Root>

<AgeQuickFilter bind:open={openFilters.age} />
<PositionQuickFilter bind:open={openFilters.position} />
