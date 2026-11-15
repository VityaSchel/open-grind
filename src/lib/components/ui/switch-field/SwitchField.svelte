<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "#lib/components/ui/label/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { Switch } from "#lib/components/ui/switch/index.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		title,
		description,
		icon,
		checked = $bindable(),
		disabled = false,
		busy = false,
		class: className,
	}: {
		title: string;
		description?: string;
		icon?: Snippet;
		checked: boolean;
		disabled?: boolean;
		busy?: boolean;
		class?: string;
	} = $props();
</script>

<Label
	class={cn(
		"flex items-center space-x-2 rounded-xl border p-4 transition-all hover:bg-muted aria-disabled:opacity-60",
		className,
	)}
	aria-disabled={disabled || busy}
>
	{#if icon !== undefined}
		<div data-slot="switch-field-icon" class="flex shrink-0">
			{@render icon()}
		</div>
	{/if}
	<div class="grid flex-1 gap-1.5 font-normal">
		<p class="text-sm leading-none font-medium">{title}</p>
		{#if description !== undefined}
			<p class="text-sm text-muted-foreground">
				{description}
			</p>
		{/if}
	</div>
	{#if busy}
		<Spinner class="text-muted-foreground" aria-hidden="true" />
	{/if}
	<Switch bind:checked disabled={disabled || busy} aria-busy={busy} />
</Label>
