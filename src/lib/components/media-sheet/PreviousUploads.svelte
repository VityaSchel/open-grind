<script lang="ts" generics="Item">
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { showErrorToast } from "$lib/api/error-toast";
	import AddTile from "$lib/components/shared/AddTile.svelte";
	import MediaGrid from "$lib/components/shared/MediaGrid.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Empty from "$lib/components/ui/empty";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import DeleteMediaDialog from "./DeleteMediaDialog.svelte";
	import MediaSheetActions from "./MediaSheetActions.svelte";
	import MediaSheetBody from "./MediaSheetBody.svelte";
	import MediaSheetTile from "./MediaSheetTile.svelte";
	import MediaTileMenu from "./MediaTileMenu.svelte";
	import type { PreviousUploadsProps } from "./previous-uploads";
	import { TileMenuState } from "./tile-menu.svelte";

	let {
		title,
		uploadLabel,
		submitLabel,
		max,
		load,
		describe,
		onUpload,
		onDelete,
		onSubmit,
		onClose,
	}: PreviousUploadsProps<Item> & { onClose: () => void } = $props();

	const selected = new SelectionSet<string | number>(
		untrack(() => (max === null ? null : Math.max(0, max))),
	);
	const deleting = new SvelteSet<string | number>();

	let items = $state<Item[] | null>(null);
	let error = $state<unknown>(null);
	let deleteTarget = $state<Item | null>(null);
	let submitting = $state(false);
	const menu = new TileMenuState<Item>();

	$effect(() => {
		void items;
		untrack(() => menu.close());
	});

	const chosen = $derived(
		(items ?? []).filter((item) => selected.has(describe(item).key)),
	);

	async function reload() {
		items = null;
		error = null;
		try {
			items = await load();
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void reload();

	function selectable(item: Item): boolean {
		return selected.has(describe(item).key) || selected.canSelectMore;
	}

	function upload() {
		onClose();
		onUpload();
	}

	async function deletePermanently(item: Item) {
		const { key, video } = describe(item);
		deleting.add(key);
		try {
			await onDelete(item);
			items = (items ?? []).filter(
				(present) => describe(present).key !== key,
			);
			selected.delete(key);
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

	async function submit() {
		if (submitting || chosen.length === 0) return;
		submitting = true;
		try {
			if (await onSubmit(chosen)) onClose();
		} finally {
			submitting = false;
		}
	}
</script>

<MediaSheetBody>
	<Drawer.Title class="mb-3 px-1">{title}</Drawer.Title>
	<MediaGrid
		{items}
		key={(item) => describe(item).key}
		empty={items?.length === 0}
		{error}
		onRetry={() => void reload()}
		skeletons={12}
		{selected}
	>
		{#snippet emptyState()}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon">
						<ImageIcon weight="fill" />
					</Empty.Media>
					<Empty.Title>No previous uploads</Empty.Title>
				</Empty.Header>
				<Empty.Content>
					<Button onclick={upload}>
						<PlusIcon weight="bold" />
						{uploadLabel}
					</Button>
				</Empty.Content>
			</Empty.Root>
		{/snippet}
		{#snippet leading()}
			<AddTile
				label={uploadLabel}
				class="aspect-(--photo-grid-aspect)"
				onclick={upload}
			/>
		{/snippet}
		{#snippet tile(item, index)}
			{@const { key, src, video } = describe(item)}
			<MediaSheetTile
				{src}
				{video}
				{index}
				selected={selected.has(key)}
				clickable={selectable(item)}
				busy={deleting.has(key)}
				lifted={menu.isLifted(key)}
				onclick={() => selected.toggle(key)}
				onMenu={(tile) => menu.open({ key, item, tile })}
			/>
		{/snippet}
	</MediaGrid>
	{#if menu.current}
		{@const { item, tile, key } = menu.current}
		{@const { video } = describe(item)}
		<MediaTileMenu
			{tile}
			{video}
			selected={selected.has(key)}
			onDelete={() => (deleteTarget = item)}
			onClose={() => menu.close()}
		/>
	{/if}
</MediaSheetBody>

<MediaSheetActions visible={selected.size > 0}>
	<Button
		size="lg"
		class="shadow-lg"
		disabled={submitting}
		onclick={() => void submit()}
	>
		{submitLabel}
		<Badge
			variant="secondary"
			class="bg-primary-foreground/10 text-primary-foreground"
		>
			{selected.size}
		</Badge>
	</Button>
</MediaSheetActions>

<DeleteMediaDialog
	bind:target={deleteTarget}
	video={(item) => describe(item).video}
	onConfirm={(item) => void deletePermanently(item)}
/>
