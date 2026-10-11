<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "$lib/components/ui/label";

	let {
		label,
		translateLabel = true,
		error,
		hint,
		control,
		picker,
	}: {
		label: string;
		translateLabel?: boolean;
		error?: string;
		hint?: string;
	} & (
		| { control: Snippet<[{ id: string }]>; picker?: never }
		| { picker: Snippet<[{ labelId: string }]>; control?: never }
	) = $props();

	const id = $props.id();
</script>

<div class="flex flex-col gap-1.5">
	<Label
		class="px-1"
		for={control ? id : undefined}
		id={picker ? id : undefined}
		translate={translateLabel ? undefined : "no"}
	>
		{label}
	</Label>
	{@render control?.({ id })}
	{@render picker?.({ labelId: id })}
	{#if error}
		<p class="px-1 text-xs text-destructive">{error}</p>
	{:else if hint}
		<p class="px-1 text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
