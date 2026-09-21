<script lang="ts" module>
	import { tv } from "tailwind-variants";

	export const addTileVariants = tv({
		base: "flex cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 px-2 text-center text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
	});
</script>

<script lang="ts">
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { cn } from "$lib/util/utils";

	let {
		label,
		href,
		disabled = false,
		class: className,
		onclick,
	}: {
		label: string;
		href?: string;
		disabled?: boolean;
		class?: import("svelte/elements").ClassValue;
		onclick?: () => void;
	} = $props();
</script>

{#snippet content()}
	<PlusIcon weight="bold" class="size-6" />
	<span class="text-xs font-medium text-balance">{label}</span>
{/snippet}

{#if href === undefined}
	<button
		type="button"
		data-slot="add-tile"
		class={cn(addTileVariants(), className)}
		{disabled}
		{onclick}
	>
		{@render content()}
	</button>
{:else}
	<a {href} data-slot="add-tile" class={cn(addTileVariants(), className)}>
		{@render content()}
	</a>
{/if}
