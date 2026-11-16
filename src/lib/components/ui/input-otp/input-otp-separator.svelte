<script lang="ts">
	import MinusIcon from "phosphor-svelte/lib/MinusIcon";
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="input-otp-separator"
	role="separator"
	class={cn(
		"flex items-center [&_svg:not([class*='size-'])]:size-4",
		className,
	)}
	{...restProps}
>
	{#if children}
		{@render children?.()}
	{:else}
		<MinusIcon />
	{/if}
</div>
