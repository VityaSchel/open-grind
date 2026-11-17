<script lang="ts">
	import { Portal } from "bits-ui";
	import { flushSync, tick } from "svelte";
	import { on } from "svelte/events";

	import { formatInteger } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { currentPlatform } from "#lib/platform/os.ts";
	import {
		gridColumns,
		RovingFocusState,
	} from "#lib/util/roving-focus-state.svelte.ts";
	import { moveForKey } from "#lib/util/roving-move.ts";
	import AddTile, { ADD_TILE_KEY } from "./AddTile.svelte";
	import {
		GridReorderState,
		keyboardDropSlot,
	} from "./grid-reorder-state.svelte";
	import MediaSlot from "./MediaSlot.svelte";

	type MediaSlotItem = {
		key: string;
		src: string | null;
		alt: string;
		deleteLabel?: string;
		undoLabel?: string;
		video?: boolean;
		pending?: boolean;
		onDelete?: () => void;
	};

	type SlotKey = { event: KeyboardEvent; index: number; slot: MediaSlotItem };

	let {
		slots,
		minSlots = 0,
		removed,
		disabled = false,
		add,
		onReorder,
	}: {
		slots: MediaSlotItem[];
		minSlots?: number;
		removed?: ReadonlySet<string>;
		disabled?: boolean;
		add?: { label: string; disabled: boolean; onclick: () => void };
		onReorder: (move: { from: number; to: number }) => void;
	} = $props();

	const REMOVE_KEYS = new Set(["Delete", "Backspace"]);
	const reorderHintId = $props.id();
	const reorder = new GridReorderState({
		onReorder: (move) => onReorder(move),
	});
	const tiles = new RovingFocusState({
		keys: () => [
			...(add === undefined ? [] : [ADD_TILE_KEY]),
			...slots.map(({ key }) => key),
		],
		orientation: "grid",
		wrap: "rows",
	});

	let grid = $state<HTMLElement | null>(null);
	let announcement = $state("");

	const placeholders = $derived(Math.max(0, minSlots - slots.length));

	const reorderable = $derived(!disabled && slots.length > 1);

	$effect(() => {
		if (!reorderable) reorder.cancel();
	});

	function positionOf(index: number): { position: string; total: string } {
		return {
			position: formatInteger(index + 1),
			total: formatInteger(slots.length),
		};
	}

	function dropHeldSlot(): void {
		const { to } = reorder;
		reorder.release();
		flushSync();
		announcement = t("common.media.slots.a11y.dropped", positionOf(to));
		const key = slots[to]?.key;
		if (key !== undefined) void tiles.focus({ key });
	}

	function cancelHeldSlot(): void {
		reorder.cancel();
		announcement = t("common.media.slots.a11y.cancelled");
	}

	function steerHeldSlot({ event }: { event: KeyboardEvent }): void {
		const cell = event.currentTarget as HTMLElement;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			cancelHeldSlot();
			return;
		}
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			if (!event.repeat) dropHeldSlot();
			return;
		}
		const move = moveForKey({
			event,
			orientation: "grid",
			direction:
				getComputedStyle(cell).direction === "rtl" ? "rtl" : "ltr",
			platform: currentPlatform(),
			hasCells: false,
			cellIsLink: false,
		});
		if (move === null || grid === null) return;
		event.preventDefault();
		const to = keyboardDropSlot({
			move,
			from: reorder.to,
			count: slots.length,
			columns: gridColumns(grid),
			leadingTiles: add === undefined ? 0 : 1,
		});
		if (to === reorder.to) return;
		reorder.aim(to);
		announcement = t("common.media.slots.a11y.moved", positionOf(to));
		void tick().then(() => cell.scrollIntoView({ block: "nearest" }));
	}

	function onSlotKeydown({ event, index, slot }: SlotKey): void {
		if (event.target !== event.currentTarget || event.isComposing) return;
		if (reorder.heldByKeyboard) {
			steerHeldSlot({ event });
			return;
		}
		if (reorder.dragging) {
			event.stopPropagation();
			if (event.key !== "Escape") return;
			event.preventDefault();
			reorder.cancel();
			return;
		}
		const { altKey, ctrlKey, metaKey, shiftKey, repeat } = event;
		if (altKey || ctrlKey || metaKey || shiftKey) return;
		if (event.key === " ") {
			event.preventDefault();
			if (!reorderable || repeat) return;
			reorder.lift(index);
			announcement = t(
				"common.media.slots.a11y.lifted",
				positionOf(index),
			);
			return;
		}
		if (disabled || repeat) return;
		if (REMOVE_KEYS.has(event.key) && slot.onDelete !== undefined) {
			event.preventDefault();
			slot.onDelete();
		}
	}

	function onSlotFocusOut(): void {
		if (reorder.heldByKeyboard && document.hasFocus()) cancelHeldSlot();
	}

	$effect(() => () => reorder.cancel());
</script>

<div
	bind:this={grid}
	data-slot="media-slot-grid"
	role="list"
	class="grid grid-cols-3 gap-2"
	{@attach reorder.grid}
	{@attach tiles.container}
>
	{#if add !== undefined}
		<div role="listitem">
			<AddTile
				label={add.label}
				class="aspect-square w-full rounded-xl"
				disabled={add.disabled}
				attach={tiles.item(ADD_TILE_KEY)}
				onclick={add.onclick}
			/>
		</div>
	{/if}
	{#each slots as slot, index (slot.key)}
		{@const held = reorder.from === index}
		{@const isRemoved = removed?.has(slot.key) ?? false}
		<div
			role="listitem"
			data-slot="media-slot-cell"
			data-dragging={held ? "" : undefined}
			data-reorderable={reorderable ? "" : undefined}
			aria-label={isRemoved
				? t("common.media.slots.a11y.removed", { label: slot.alt })
				: slot.alt}
			aria-describedby={reorderable ? reorderHintId : undefined}
			aria-keyshortcuts={slot.onDelete === undefined
				? undefined
				: [...REMOVE_KEYS].join(" ")}
			class={[
				"focus-ring-overlay touch-pan-y rounded-xl focus-visible:relative",
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
			{@attach tiles.item(slot.key)}
			{@attach (cell) =>
				on(cell, "keydown", (event) =>
					onSlotKeydown({ event, index, slot }),
				)}
			onfocusout={onSlotFocusOut}
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
				removed={isRemoved}
				undoLabel={slot.undoLabel}
				video={slot.video}
				pending={slot.pending}
				{held}
				deleteFocusable={false}
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
<Portal>
	<span id={reorderHintId} hidden>
		{t("common.media.slots.a11y.reorderHint")}
	</span>
	<div role="status" data-slot="media-slot-grid-status" class="sr-only">
		{announcement}
	</div>
</Portal>
