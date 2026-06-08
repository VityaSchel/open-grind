<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Switch } from "$lib/components/ui/switch";

	let {
		title,
		description,
		checked = $bindable(),
		disabled = false,
	}: {
		title: string;
		description: string;
		checked: boolean;
		disabled?: boolean;
	} = $props();
</script>

<Label
	class="flex items-center space-x-2 hover:bg-muted rounded-xl border p-4 transition-all aria-disabled:opacity-60"
	aria-disabled={disabled}
>
	<div class="grid gap-1.5 font-normal">
		<p class="text-sm leading-none font-medium">{title}</p>
		<p class="text-muted-foreground text-sm">
			{description}
		</p>
	</div>
	<Switch bind:checked {disabled} />
</Label>
