<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Switch } from "$lib/components/ui/switch";

	let {
		title,
		description,
		checked = $bindable(),
		disabled = false,
		busy = false,
	}: {
		title: string;
		description?: string;
		checked: boolean;
		disabled?: boolean;
		busy?: boolean;
	} = $props();
</script>

<Label
	class="flex items-center space-x-2 rounded-xl border p-4 transition-all hover:bg-muted aria-disabled:opacity-60"
	aria-disabled={disabled || busy}
>
	<div class="grid flex-1 gap-1.5 font-normal">
		<p class="text-sm leading-none font-medium">{title}</p>
		{#if description !== undefined}
			<p class="text-sm text-muted-foreground">
				{description}
			</p>
		{/if}
	</div>
	{#if busy}
		<Spinner class="text-muted-foreground" />
	{/if}
	<Switch bind:checked disabled={disabled || busy} />
</Label>
