<script lang="ts">
	import type { Snippet } from "svelte";

	import * as Item from "$lib/components/ui/item";

	let { children }: { children: Snippet } = $props();
</script>

<Item.Root
	variant="outline"
	data-slot="field-pair"
	class="flex-col items-stretch gap-1 p-3 pb-1"
>
	{@render children()}
</Item.Root>
