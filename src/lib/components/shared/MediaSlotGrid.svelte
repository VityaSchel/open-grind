<script lang="ts" module>
	export type MediaSlotItem = {
		key: string;
		src: string | null;
		alt: string;
		deleteLabel: string;
		undoLabel?: string;
		video?: boolean;
		pending?: boolean;
		onDelete: () => void;
	};
</script>

<script lang="ts">
	import { GridReorder } from "$lib/util/grid-reorder.svelte";
	import MediaSlot from "./MediaSlot.svelte";

	let {
		slots,
		minSlots = 0,
		removed,
		disabled = false,
		onReorder,
	}: {
		slots: MediaSlotItem[];
		minSlots?: number;
		removed?: ReadonlySet<string>;
		disabled?: boolean;
		onReorder: (move: { from: number; to: number }) => void;
	} = $props();

	const placeholders = $derived(Math.max(0, minSlots - slots.length));

	const reorder = new GridReorder({ onReorder: (move) => onReorder(move) });

	const reorderable = $derived(!disabled && slots.length > 1);

	$effect(() => {
		if (disabled) reorder.cancel();
	});
</script>

<div data-slot="media-slot-grid" role="list" class="grid grid-cols-3 gap-2">
	{#each slots as slot, index (slot.key)}
		{@const held = reorder.from === index}
		<div
			role="listitem"
			data-slot="media-slot-cell"
			data-dragging={held ? "" : undefined}
			class={[
				"touch-pan-y",
				{
					"[-webkit-touch-callout:none] **:[-webkit-touch-callout:none]":
						reorderable,
					"relative z-1": held,
					"transition-transform duration-200":
						reorder.dragging && !held,
				},
			]}
			style:transform={reorder.transformFor(index)}
			{@attach reorder.cell(index)}
			onpointerdown={reorderable
				? (event) => reorder.press({ event, index })
				: undefined}
			onpointermove={reorderable
				? (event) => reorder.move(event)
				: undefined}
			onpointerup={reorderable ? () => reorder.release() : undefined}
			onpointercancel={reorderable ? () => reorder.cancel() : undefined}
		>
			<MediaSlot
				src={slot.src}
				alt={slot.alt}
				deleteLabel={slot.deleteLabel}
				removed={removed?.has(slot.key)}
				undoLabel={slot.undoLabel}
				video={slot.video}
				pending={slot.pending}
				{held}
				onDelete={slot.onDelete}
			/>
		</div>
	{/each}
	{#each Array.from({ length: placeholders })}
		<div
			class="aspect-square rounded-xl border border-dashed border-border"
			aria-hidden="true"
		></div>
	{/each}
</div>
