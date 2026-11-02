<script lang="ts">
	import type { ComponentProps } from "svelte";

	import { Separator } from "#lib/components/ui/separator/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ComponentProps<typeof Separator> = $props();
</script>

<Separator
	bind:ref
	data-slot="item-separator"
	orientation="horizontal"
	class={cn("my-2", className)}
	{...restProps}
/>
