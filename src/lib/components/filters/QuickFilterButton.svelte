<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		active,
		onclick,
		children,
	}: {
		active: boolean;
		onclick: () => void;
		children: import("svelte").Snippet;
	} = $props();
</script>

<Button
	variant="secondary"
	{onclick}
	class={{ "bg-white text-popover hover:bg-neutral-200": active }}
>
	{@render children()}
</Button>
