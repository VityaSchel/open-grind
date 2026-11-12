<script lang="ts">
	import * as ToggleGroup from "./index.ts";

	let {
		type,
		label,
		options,
		chosen,
	}: {
		type: "single" | "multiple";
		label: string;
		options: { value: string; text: string }[];
		chosen: string;
	} = $props();
</script>

{#snippet items()}
	{#each options as { value, text } (value)}
		<ToggleGroup.Item {value}>{text}</ToggleGroup.Item>
	{/each}
{/snippet}

{#if type === "single"}
	<ToggleGroup.Root type="single" value={chosen} aria-label={label}>
		{@render items()}
	</ToggleGroup.Root>
{:else}
	<ToggleGroup.Root type="multiple" value={[chosen]} aria-label={label}>
		{@render items()}
	</ToggleGroup.Root>
{/if}
