<script lang="ts">
	import { buttonVariants } from "#lib/components/ui/button/index.ts";
	import { Toggle } from "#lib/components/ui/toggle/index.ts";

	let {
		pressed = $bindable(false),
		class: className,
		...restProps
	}: import("svelte").ComponentProps<typeof Toggle> = $props();
</script>

<Toggle
	bind:pressed
	size="sm"
	class={[
		buttonVariants({ variant: "secondary" }),
		"rounded-none first:rounded-l-3xl last:rounded-r-3xl focus:z-10 focus-visible:z-10 data-[state=on]:bg-popover-foreground data-[state=on]:text-popover",
		className,
	]}
	{...restProps}
/>
