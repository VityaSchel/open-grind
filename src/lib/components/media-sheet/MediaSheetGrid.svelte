<script lang="ts" generics="Item, Key extends string | number">
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { type Snippet, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "$lib/api/error-toast";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaGrid from "$lib/components/shared/MediaGrid.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import type { SelectionSet } from "$lib/util/selection.svelte";
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

	const deleting = new SvelteSet<Key>();
	const menu = new TileMenuState<Item>();
	let deleteTarget = $state<Item | null>(null);

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
					? "Couldn't delete video"
					: "Couldn't delete photo",
				error: err,
			});
		} finally {
			deleting.delete(key);
		}
	}
</script>

<MediaGrid
	{items}
	key={(item) => describe(item).key}
	empty={items?.length === 0 && pending === 0}
	{error}
	{onRetry}
	skeletons={12}
	{selected}
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
			onclick={() => onToggle(key)}
			onMenu={(tile) => menu.open({ key, item, tile })}
		>
			{#snippet overlay()}
				{@render itemOverlay?.(item)}
			{/snippet}
		</MediaSheetTile>
	{/snippet}
</MediaGrid>

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

<DeleteMediaDialog
	bind:target={deleteTarget}
	video={(item) => describe(item).video}
	onConfirm={(item) => void deletePermanently(item)}
/>
