<script lang="ts">
	import * as Item from "#lib/components/ui/item/index.ts";
	import * as RadioGroup from "#lib/components/ui/radio-group/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		class: className,
		...restProps
	}: import("svelte").ComponentProps<typeof RadioGroup.Item> = $props();
</script>

<RadioGroup.Item
	class={cn(
		Item.itemVariants(),
		"rounded-none border-0 text-left not-first:border-t not-first:border-border first:rounded-t-[calc(var(--radius-2xl)_-_1px)] last:rounded-b-[calc(var(--radius-2xl)_-_1px)] focus-visible:ring-inset",
		className,
	)}
	{...restProps}
/>
