<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";

	let { tags }: { tags: string[] | null } = $props();
</script>

{#if tags !== null && tags.length > 0}
	<div class="mt-4 flex flex-wrap items-center gap-1">
		{#each tags as tag (tag)}
			<Badge variant="secondary" class="font-normal">
				{tag}
			</Badge>
		{/each}
	</div>
{/if}
