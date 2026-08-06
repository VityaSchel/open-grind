<script lang="ts">
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import FilterField from "./FilterField.svelte";

	let {
		id,
		checked = $bindable(),
		children,
		endAdornment,
	}: {
		id: string;
		checked: boolean;
		children?: import("svelte").Snippet;
		endAdornment?: import("svelte").Snippet;
	} = $props();

	const uid = $props.id();
</script>

<FilterField>
	<Checkbox id="filters-{id}-{uid}" bind:checked />
	<Label for="filters-{id}-{uid}" class="min-h-5"
		>{@render children?.()}</Label
	>
	{#if endAdornment}
		<span class="ml-auto min-w-0 truncate">
			{@render endAdornment()}
		</span>
	{/if}
</FilterField>
