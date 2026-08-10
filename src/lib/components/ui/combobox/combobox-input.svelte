<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";
	import { getComboboxCtx } from "./combobox.svelte";

	let {
		ref = $bindable(null),
		class: className,
		onkeydown,
		...restProps
	}: ComboboxPrimitive.InputProps = $props();

	const ctx = getComboboxCtx();

	const navigationKeys = [
		"ArrowDown",
		"ArrowUp",
		"Home",
		"End",
		"PageDown",
		"PageUp",
	];
</script>

<ComboboxPrimitive.Input
	bind:ref
	data-slot="combobox-input"
	class={cn(
		"h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 py-1 pr-9 pl-3 text-base transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm",
		className,
	)}
	onkeydown={(event) => {
		if (navigationKeys.includes(event.key)) ctx.setKeyboardNav(true);
		onkeydown?.(event);
	}}
	{...restProps}
/>
