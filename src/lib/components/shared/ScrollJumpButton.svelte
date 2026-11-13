<script lang="ts">
	import { sineOut } from "svelte/easing";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { fly } from "#lib/util/reduced-motion.ts";

	let {
		label,
		onclick,
		class: className,
		children,
		badge,
	}: {
		label: string;
		onclick: () => void;
		class?: import("svelte/elements").ClassValue;
		children: import("svelte").Snippet;
		badge?: import("svelte").Snippet;
	} = $props();
</script>

<div
	class={["floating-chip", className]}
	transition:fly={{ y: 48, opacity: 0, duration: 200, easing: sineOut }}
>
	<Button
		variant="outline"
		size="icon-lg"
		aria-label={label}
		class="shadow-sm"
		onclick={() => onclick()}
	>
		{@render children()}
	</Button>
	{@render badge?.()}
</div>
