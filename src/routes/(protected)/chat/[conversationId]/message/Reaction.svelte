<script lang="ts">
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { Badge } from "$lib/components/ui/badge";

	let { type }: { type: number; count: number } = $props();
</script>

<Badge
	class="text-white text-xs shrink-0 px-1 h-auto border border-muted-foreground/20"
	variant="secondary"
>
	{#if type === 1}
		<img
			src={fireEmoji}
			alt="Fire emoji"
			width="16"
			height="16"
			draggable="false"
		/>
	{:else}
		&#65533;
	{/if}
</Badge>
