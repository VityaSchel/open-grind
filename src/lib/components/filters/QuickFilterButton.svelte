<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		active,
		label,
		onclick,
		children,
	}: {
		active: boolean;
		label?: string;
		onclick: () => void;
		children: import("svelte").Snippet;
	} = $props();
</script>

<Button
	variant="secondary"
	aria-label={label}
	{onclick}
	class={{ "bg-white text-popover hover:bg-neutral-200": active }}
>
	{@render children()}
</Button>
