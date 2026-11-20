<script lang="ts" generics="Item, Key extends string | number">
	import DotsThreeIcon from "phosphor-svelte/lib/DotsThreeIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { type Snippet, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import AddTile, {
		ADD_TILE_KEY,
	} from "#lib/components/shared/AddTile.svelte";
	import MediaGrid from "#lib/components/shared/MediaGrid.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import { formatInteger } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import type { SelectionSet } from "#lib/util/selection.svelte.ts";
	import DeleteMediaDialog from "./DeleteMediaDialog.svelte";
	import MediaSheetTile from "./MediaSheetTile.svelte";
	import MediaTileMenu from "./MediaTileMenu.svelte";
	import type { UploadTile } from "./previous-uploads";
	import { TileMenuState } from "./tile-menu.svelte";

	let {
		items,
		error,
		onRetry,
		describe,
		selected,
		onToggle,
		emptyTitle,
		addLabel,
		onAdd,
		pending = 0,
		remove,
		onRemoved,
		overlay: itemOverlay,
	}: {
		items: Item[] | null;
		error: unknown;
		onRetry: () => void;
		describe: (item: Item) => UploadTile & { key: Key };
		selected: SelectionSet<Key>;
		onToggle: (key: Key) => void;
		emptyTitle: string;
		addLabel: string;
		onAdd: () => void;
		pending?: number;
		remove: (item: Item) => Promise<void>;
		onRemoved: (item: Item) => void;
		overlay?: Snippet<[Item]>;
	} = $props();

	const tiles = new RovingFocusState({
		keys: () => [ADD_TILE_KEY, ...uploadingKeys, ...itemKeys],
		orientation: "grid",
		wrap: "rows",
	});
	const deleting = new SvelteSet<Key>();
	const menu = new TileMenuState<Item>();
	let deleteTarget = $state<Item | null>(null);

	const uploadingKeys = $derived(
		Array.from({ length: pending }, (_, slot) => `uploading-${slot}`),
	);
	const itemKeys = $derived((items ?? []).map((item) => describe(item).key));
	const activeIndex = $derived(
		itemKeys.findIndex((key) => key === tiles.activeKey),
	);
	const activeItem = $derived(
		activeIndex < 0 ? null : (items?.[activeIndex] ?? null),
	);

	let surface: HTMLDivElement | null = $state(null);
	let tileActionsFocused = $state(false);
	let tileActionsPlacement = $state({ top: 0, inlineEnd: 0 });
	const tileActionsStyle = $derived(
		`top: ${tileActionsPlacement.top}px; inset-inline-end: ${tileActionsPlacement.inlineEnd}px`,
	);

	function activeTile(): HTMLButtonElement | null {
		return (
			surface?.querySelectorAll<HTMLButtonElement>(
				'[data-slot="media-tile"]',
			)[activeIndex] ?? null
		);
	}

	function placeTileActions() {
		const tile = activeTile();
		if (surface === null || tile === null) return;
		const tileBox = tile.getBoundingClientRect();
		const surfaceBox = surface.getBoundingClientRect();
		const rtl = getComputedStyle(surface).direction === "rtl";
		tileActionsPlacement = {
			top: tileBox.top - surfaceBox.top,
			inlineEnd: rtl
				? tileBox.left - surfaceBox.left
				: surfaceBox.right - tileBox.right,
		};
	}

	$effect(() => {
		if (!tileActionsFocused || surface === null) return;
		const observer = new ResizeObserver(placeTileActions);
		observer.observe(surface);
		return () => observer.disconnect();
	});

	function openActiveTileMenu() {
		const tile = activeTile();
		if (activeItem === null || tile === null) return;
		const { key } = describe(activeItem);
		if (!deleting.has(key)) menu.open({ key, item: activeItem, tile });
	}

	$effect(() => {
		void items;
		void pending;
		untrack(() => menu.close());
	});

	async function deletePermanently(item: Item) {
		const { key, video } = describe(item);
		deleting.add(key);
		try {
			await remove(item);
			onRemoved(item);
			if (selected.has(key)) onToggle(key);
		} catch (err) {
			console.error(err);
			showErrorToast({
				label: video
					? t("media.sheet.errors.deleteVideoFailed")
					: t("media.sheet.errors.deletePhotoFailed"),
				error: err,
			});
		} finally {
			deleting.delete(key);
		}
	}
</script>

<div bind:this={surface} class="relative flex flex-1 flex-col">
	<MediaGrid
		{items}
		key={(item) => describe(item).key}
		empty={items?.length === 0 && pending === 0}
		{error}
		{onRetry}
		skeletons={12}
		{selected}
		roving={tiles}
	>
		{#snippet emptyState()}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon">
						<ImageIcon weight="fill" />
					</Empty.Media>
					<Empty.Title>{emptyTitle}</Empty.Title>
				</Empty.Header>
				<Empty.Content>
					<Button onclick={onAdd}>
						<PlusIcon weight="bold" />
						{addLabel}
					</Button>
				</Empty.Content>
			</Empty.Root>
		{/snippet}
		{#snippet leading()}
			<AddTile
				label={addLabel}
				class="aspect-(--photo-grid-aspect)"
				attach={tiles.item(ADD_TILE_KEY)}
				onclick={onAdd}
			/>
			{#each Array(pending)}
				<MediaImage
					src={null}
					pending
					class="aspect-(--photo-grid-aspect)"
				/>
			{/each}
		{/snippet}
		{#snippet tile(item, index)}
			{@const { key, src, video } = describe(item)}
			{@const isSelected = selected.has(key)}
			<MediaSheetTile
				{src}
				{video}
				{index}
				selected={isSelected}
				clickable={isSelected || selected.canSelectMore}
				busy={deleting.has(key)}
				lifted={menu.isLifted(key)}
				attach={tiles.item(key)}
				onclick={() => onToggle(key)}
				onMenu={(tile) => menu.open({ key, item, tile })}
			>
				{#snippet overlay()}
					{@render itemOverlay?.(item)}
				{/snippet}
			</MediaSheetTile>
		{/snippet}
	</MediaGrid>
	{#if activeItem !== null}
		{@const { key, video } = describe(activeItem)}
		<Button
			data-slot="media-tile-actions"
			variant="secondary"
			size="icon-sm"
			tabindex={0}
			aria-label={t(
				video
					? "media.sheet.tileMenu.a11y.trigger.video"
					: "media.sheet.tileMenu.a11y.trigger.photo",
				{ position: formatInteger(activeIndex + 1) },
			)}
			aria-haspopup="menu"
			aria-expanded={menu.isLifted(key)}
			aria-disabled={deleting.has(key)}
			class="absolute me-1.5 mt-1.5 size-8 transition-none not-focus-visible:sr-only"
			style={tileActionsStyle}
			onfocus={() => {
				placeTileActions();
				tileActionsFocused = true;
			}}
			onblur={() => (tileActionsFocused = false)}
			onclick={openActiveTileMenu}
			oncontextmenu={(event) => {
				event.preventDefault();
				openActiveTileMenu();
			}}
		>
			<DotsThreeIcon weight="bold" />
		</Button>
	{/if}
</div>

{#key menu.current}
	{#if menu.current}
		{@const { item, tile } = menu.current}
		{@const { key, video } = describe(item)}
		<MediaTileMenu
			{tile}
			{video}
			selected={selected.has(key)}
			onDelete={() => (deleteTarget = item)}
			onClose={() => menu.close()}
		>
			{#snippet overlay()}
				{@render itemOverlay?.(item)}
			{/snippet}
		</MediaTileMenu>
	{/if}
{/key}

<DeleteMediaDialog
	bind:target={deleteTarget}
	video={(item) => describe(item).video}
	onConfirm={(item) => void deletePermanently(item)}
/>
