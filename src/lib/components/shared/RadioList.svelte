<script lang="ts">
	import * as RadioGroup from "#lib/components/ui/radio-group/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: import("svelte").ComponentProps<typeof RadioGroup.Root> = $props();
</script>

<RadioGroup.Root
	bind:ref
	bind:value
	class={cn("overflow-hidden rounded-2xl border border-border", className)}
	{...restProps}
/>
