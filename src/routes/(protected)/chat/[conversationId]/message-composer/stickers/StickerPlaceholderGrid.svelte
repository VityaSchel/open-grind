<script lang="ts">
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { TabSelection } from "../attachments/tabs";

	let {
		item,
		columns,
		onSelectionChange,
		onClose,
	}: {
		item: string;
		columns: 2 | 4;
		onSelectionChange: (selection: TabSelection) => void;
		onClose: () => void;
	} = $props();

	const PLACEHOLDER_COUNT = 40;
	const selected = new SelectionSet<number>();

	function toggle(index: number) {
		selected.toggleExclusive(index);
		onSelectionChange({ count: selected.size, label: `Send ${item}` });
	}

	export function submitSelection() {
		onClose();
		toast(ToastUnimplemented, {
			componentProps: { feature: `Sending a ${item}`, issue: 31 },
		});
	}
</script>

<div
	data-slot="sticker-grid"
	class={[
		"grid gap-1",
		{ "grid-cols-2": columns === 2, "grid-cols-4": columns === 4 },
	]}
>
	{#each { length: PLACEHOLDER_COUNT }, index (index)}
		{@const isSelected = selected.has(index)}
		<button
			type="button"
			data-slot="sticker-tile"
			class="relative aspect-square cursor-pointer rounded-lg bg-muted"
			aria-label="{item} {index + 1}"
			aria-pressed={isSelected}
			onclick={() => toggle(index)}
		>
			{#if isSelected}
				<SelectionOverlay />
			{/if}
		</button>
	{/each}
</div>
