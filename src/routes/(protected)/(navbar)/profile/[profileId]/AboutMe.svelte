<script lang="ts">
	import * as Card from "$lib/components/ui/card";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<Card.Root class="mt-6">
	<Card.Content
		class="wrap-break-word whitespace-pre-wrap select-text"
		translate="no"
	>
		{@render children?.()}
	</Card.Content>
</Card.Root>
