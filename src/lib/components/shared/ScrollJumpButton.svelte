<script lang="ts">
	import { sineOut } from "svelte/easing";

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
	transition:fly={{ y: 48, opacity: 0, duration: 200, easing: sineOut }}
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
