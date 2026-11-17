<script lang="ts" generics="T extends unknown">
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
		id,
		label,
		items,
		convert,
		notSpecified = false,
	}: {
		checked: boolean;
		value: T[];
		id: string;
		label: string;
		items: { value: T; label: string }[];
		convert: (v: string) => T;
		notSpecified?: boolean;
	} = $props();

	const allItems = $derived(
		notSpecified
			? [
					...items,
					{
						value: convert("-1"),
						label: t("common.filters.notSpecified"),
					},
				]
			: items,
	);

	const chips = new RovingFocusState({
		keys: () => allItems.map(({ value }) => String(value)),
		orientation: "horizontal",
		wrap: "loop",
	});
</script>

<div class="flex min-w-0 flex-col">
	<FilterDropdown {id} {label} bind:checked>
		<ToggleGroup.Root
			type="multiple"
			variant="outline"
			spacing={2}
			class="w-full flex-wrap gap-1"
			rovingFocus={false}
			aria-label={label}
			{@attach chips.container}
			bind:value={
				() => value.map(String),
				(v: string[]) => (
					(checked = v.length > 0),
					(value = v.map(convert))
				)
			}
		>
			{#each allItems as { value, label } (value)}
				<ToggleGroup.Item
					value={String(value)}
					{@attach chips.item(String(value))}
					>{label}</ToggleGroup.Item
				>
			{/each}
		</ToggleGroup.Root>
	</FilterDropdown>
</div>
