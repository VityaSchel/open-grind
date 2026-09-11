<script lang="ts">
	import { SparkleIcon } from "phosphor-svelte";

	let { isNew }: { isNew: boolean } = $props();
</script>

{#if isNew}
	<span
		data-slot="new-badge"
		class="flex items-center gap-1 whitespace-nowrap text-primary"
		title="Joined recently"
	>
		<SparkleIcon weight="fill" class="shrink-0" />
		New
	</span>
{/if}
