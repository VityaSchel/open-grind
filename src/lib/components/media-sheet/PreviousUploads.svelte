<script lang="ts" generics="Item">
	import { untrack } from "svelte";

	import * as Drawer from "$lib/components/ui/drawer";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import MediaSheetActions from "./MediaSheetActions.svelte";
	import MediaSheetBody from "./MediaSheetBody.svelte";
	import MediaSheetGrid from "./MediaSheetGrid.svelte";
	import type { PreviousUploadsProps } from "./previous-uploads";

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

	let items = $state<Item[] | null>(null);
	let error = $state<unknown>(null);
	let submitting = $state(false);

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

	function upload() {
		onClose();
		onUpload();
	}

	function forget(item: Item) {
		const { key } = describe(item);
		items = (items ?? []).filter(
			(present) => describe(present).key !== key,
		);
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
	<MediaSheetGrid
		{items}
		{error}
		onRetry={() => void reload()}
		{describe}
		{selected}
		onToggle={(key) => selected.toggle(key)}
		emptyTitle="No previous uploads"
		addLabel={uploadLabel}
		onAdd={upload}
		remove={onDelete}
		onRemoved={forget}
	/>
</MediaSheetBody>

<MediaSheetActions
	label={submitLabel}
	count={selected.size}
	disabled={submitting}
	onSubmit={() => void submit()}
/>
