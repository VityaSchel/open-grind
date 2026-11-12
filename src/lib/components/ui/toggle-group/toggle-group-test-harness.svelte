<script lang="ts">
	import * as ToggleGroup from "./index.ts";

	let { type }: { type: "single" | "multiple" } = $props();
</script>

{#if type === "single"}
	<ToggleGroup.Root type="single" value="metric" aria-label="Units">
		<ToggleGroup.Item value="metric">Metric</ToggleGroup.Item>
		<ToggleGroup.Item value="imperial">Imperial</ToggleGroup.Item>
	</ToggleGroup.Root>
{:else}
	<ToggleGroup.Root type="multiple" value={["metric"]} aria-label="Units">
		<ToggleGroup.Item value="metric">Metric</ToggleGroup.Item>
		<ToggleGroup.Item value="imperial">Imperial</ToggleGroup.Item>
	</ToggleGroup.Root>
{/if}
