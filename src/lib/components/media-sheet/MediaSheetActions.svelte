<script lang="ts">
	import { expoOut, sineIn } from "svelte/easing";
	import type { Snippet } from "svelte";

	import { fly } from "$lib/util/reduced-motion";
	import { cn } from "$lib/util/utils";

	let {
		visible,
		class: className,
		children,
	}: { visible: boolean; class?: string; children: Snippet } = $props();
</script>

{#if visible}
	<div
		data-slot="sheet-actions"
		class={cn(
			"pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-2 *:pointer-events-auto",
			className,
		)}
		in:fly={{ duration: 600, y: 100, easing: expoOut }}
		out:fly={{ duration: 400, y: 100, easing: sineIn }}
	>
		{@render children()}
	</div>
{/if}
