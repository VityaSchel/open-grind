<script lang="ts">
	import type { Snippet } from "svelte";

	let { label, children }: { label?: string; children: Snippet } = $props();
</script>

<div
	role={label === undefined ? undefined : "menu"}
	aria-label={label}
	class="flex w-max min-w-45 flex-col rounded-xl bg-black/80 p-1 *:justify-start *:active:translate-y-0!"
>
	{@render children()}
</div>
