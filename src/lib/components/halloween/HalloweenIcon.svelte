<script lang="ts">
	import type { Snippet } from "svelte";

	import type { HalloweenIconProps } from "./halloween";

	let {
		children,
		...rest
	}: HalloweenIconProps & { viewBox: string; children: Snippet } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" {...rest}>
	{@render children()}
</svg>
