<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";

	let {
		label,
		value = $bindable(),
		maxLength,
		placeholder,
	}: {
		label?: string;
		value: string;
		maxLength: number;
		placeholder?: string;
	} = $props();

	const remaining = $derived(maxLength - value.length);
	const over = $derived(remaining < 0);
</script>

<div class="flex flex-col gap-1.5">
	{#if label !== undefined}
		<Label class="px-1">{label}</Label>
	{/if}
	<Textarea bind:value {placeholder} aria-invalid={over} class="min-h-24" />
	<div class="flex justify-end gap-2 px-1 text-xs">
		<span
			class={[
				"tabular-nums",
				{ "text-destructive": over, "text-muted-foreground": !over },
			]}
		>
			{remaining}
		</span>
	</div>
</div>
