<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { type GaymojiItem, getGaymoji } from "$lib/api/messaging/gaymoji";
	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { TabSelection } from "../../attachments/tabs";
	import GaymojiTile from "./GaymojiTile.svelte";

	let {
		active,
		onSelectionChange,
		onClose,
	}: {
		active: boolean;
		onSelectionChange: (selection: TabSelection) => void;
		onClose: () => void;
	} = $props();

	type Manifest =
		| { status: "idle" | "loading" | "failed" }
		| { status: "ready"; gaymoji: GaymojiItem[] };

	const SKELETON_ROWS = 3;
	const SKELETON_COLUMNS = [
		"",
		"",
		"",
		"hidden @gaymoji4/sticker-grid:block",
		"hidden @gaymoji5/sticker-grid:block",
		"hidden @gaymoji6/sticker-grid:block",
		"hidden @gaymoji7/sticker-grid:block",
		"hidden @gaymoji8/sticker-grid:block",
	];
	const GRID_CLASS =
		"grid grid-cols-3 gap-1 @gaymoji4/sticker-grid:grid-cols-4 @gaymoji5/sticker-grid:grid-cols-5 @gaymoji6/sticker-grid:grid-cols-6 @gaymoji7/sticker-grid:grid-cols-7 @gaymoji8/sticker-grid:grid-cols-8";

	const selected = new SelectionSet<string>();

	let manifest = $state.raw<Manifest>({ status: "idle" });

	async function load() {
		manifest = { status: "loading" };
		try {
			manifest = { status: "ready", gaymoji: await getGaymoji() };
		} catch (error) {
			console.error(error);
			manifest = { status: "failed" };
		}
	}

	function loadOnFirstVisit() {
		if (manifest.status === "idle") void load();
	}

	$effect(() => {
		if (active) untrack(loadOnFirstVisit);
	});

	function toggle(id: string) {
		selected.toggleExclusive(id);
		onSelectionChange({ count: selected.size, label: "Send Gaymoji" });
	}

	export function submitSelection() {
		onClose();
		toast(ToastUnimplemented, {
			componentProps: { feature: "Sending a Gaymoji", issue: 31 },
		});
	}
</script>

<div class="@container/sticker-grid">
	{#if active && manifest.status === "ready"}
		<div data-slot="sticker-grid" class={GRID_CLASS}>
			{#each manifest.gaymoji as gaymoji, index (index)}
				<GaymojiTile
					{gaymoji}
					selected={selected.has(gaymoji.id)}
					onclick={() => toggle(gaymoji.id)}
				/>
			{/each}
		</div>
	{:else if manifest.status === "loading"}
		<div
			data-slot="sticker-grid-skeleton"
			aria-busy="true"
			class={GRID_CLASS}
		>
			{#each SKELETON_COLUMNS as columnClass, column (column)}
				{#each { length: SKELETON_ROWS }, row (row)}
					<Skeleton
						class={["aspect-square rounded-lg", columnClass]}
					/>
				{/each}
			{/each}
		</div>
	{:else if manifest.status === "failed"}
		<div class="flex flex-col items-center gap-2 p-4">
			<p class="text-center text-sm text-muted-foreground">
				Couldn't load Gaymoji
			</p>
			<Button size="sm" onclick={() => void load()}>Retry</Button>
		</div>
	{/if}
</div>
