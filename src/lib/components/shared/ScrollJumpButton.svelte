<script lang="ts">
	import { FLOATING_CHIP_FLY } from "#lib/components/shared/floating-chip.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { fly } from "#lib/util/reduced-motion.ts";

	let {
		label,
		onclick,
		size = "icon-lg",
		class: className,
		children,
		badge,
		onoutroend,
	}: {
		label: string;
		onclick: () => void;
		size?: "icon-lg" | "lg";
		class?: import("svelte/elements").ClassValue;
		children: import("svelte").Snippet;
		badge?: import("svelte").Snippet;
		onoutroend?: () => void;
	} = $props();
</script>

<div
	class={["floating-chip", className]}
	transition:fly={FLOATING_CHIP_FLY}
	{onoutroend}
>
	<Button
		variant="outline"
		{size}
		aria-label={label}
		class="shadow-sm"
		onclick={() => onclick()}
	>
		{@render children()}
	</Button>
	{@render badge?.()}
</div>
