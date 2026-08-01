<script lang="ts">
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { Badge } from "$lib/components/ui/badge";

	let { type }: { type: number; count: number } = $props();
</script>

<Badge
	class="h-auto shrink-0 border border-muted-foreground/20 px-1 text-xs text-white"
	variant="secondary"
>
	{#if type === 1}
		<img
			src={fireEmoji}
			alt="Fire reaction"
			width="16"
			height="16"
			draggable="false"
		/>
	{:else}
		&#65533;
	{/if}
</Badge>
