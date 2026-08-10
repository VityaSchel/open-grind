<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	import { cn } from "$lib/util/utils.js";
	import { getComboboxCtx } from "./combobox.svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		children,
		...restProps
	}: ComboboxPrimitive.ContentProps = $props();

	const ctx = getComboboxCtx();
</script>

<ComboboxPrimitive.Portal>
	<ComboboxPrimitive.Content
		bind:ref
		{sideOffset}
		data-slot="combobox-content"
		data-kb-nav={ctx.keyboardNav ? "" : undefined}
		onpointerdown={() => ctx.setKeyboardNav(false)}
		onpointermove={() => ctx.setKeyboardNav(false)}
		class={cn(
			"z-50 max-h-72 w-(--bits-floating-anchor-width) overflow-y-auto rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none dark:ring-foreground/10",
			className,
		)}
		{...restProps}
	>
		<ComboboxPrimitive.Viewport>
			{@render children?.()}
		</ComboboxPrimitive.Viewport>
	</ComboboxPrimitive.Content>
</ComboboxPrimitive.Portal>
