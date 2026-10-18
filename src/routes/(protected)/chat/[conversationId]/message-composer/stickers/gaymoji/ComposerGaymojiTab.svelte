<script lang="ts">
	import { untrack } from "svelte";

	import {
		type GaymojiCategory,
		getGaymoji,
	} from "$lib/api/messaging/gaymoji";
	import { gaymojiSections } from "$lib/chat/gaymoji-sections";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { StickerPick } from "../sticker-pick";
	import StickerLoadFailure from "../StickerLoadFailure.svelte";
	import { GAYMOJI_GRID_CLASS } from "./gaymoji-grid";
	import GaymojiSection from "./GaymojiSection.svelte";
	import GaymojiSectionStrip from "./GaymojiSectionStrip.svelte";
	import { SectionScroll } from "./section-scroll.svelte";
	import { SectionWindows } from "./section-windows.svelte";

	let {
		active,
		pickedId,
		onPick,
		holdSheetSize,
	}: {
		active: boolean;
		pickedId: string | null;
		onPick: (pick: StickerPick) => void;
		holdSheetSize: () => () => void;
	} = $props();

	type Manifest =
		| { status: "idle" | "loading" | "failed" }
		| { status: "ready"; categories: GaymojiCategory[] };

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

	const windows = new SectionWindows();

	let manifest = $state.raw<Manifest>({ status: "idle" });
	let content = $state<HTMLElement | null>(null);
	let strip = $state<HTMLElement | null>(null);

	const sections = $derived(
		manifest.status === "ready" ? gaymojiSections(manifest.categories) : [],
	);
	const scroll = new SectionScroll({
		keys: () => sections.map(({ key }) => key),
		strip: () => strip,
		holdSheetSize: () => holdSheetSize(),
	});

	$effect(() => {
		if (content && strip) return scroll.follow(content);
	});

	async function load() {
		manifest = { status: "loading" };
		try {
			manifest = { status: "ready", categories: await getGaymoji() };
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
</script>

<div
	bind:this={content}
	data-slot="gaymoji-tab"
	class="@container/sticker-grid flex flex-1 flex-col"
>
	{#if active && manifest.status === "ready"}
		<GaymojiSectionStrip
			bind:ref={strip}
			{sections}
			current={scroll.current}
			onPick={(key) => scroll.jumpTo(key)}
		/>
		{#each sections as section (section.key)}
			<GaymojiSection
				{section}
				headers={scroll.headers}
				{windows}
				{pickedId}
				onToggle={(gaymoji) =>
					onPick({
						id: gaymoji.id,
						message: {
							type: "Gaymoji",
							body: { imageHash: gaymoji.imageHash },
						},
					})}
			/>
		{/each}
	{:else if manifest.status === "loading"}
		<div
			data-slot="sticker-grid-skeleton"
			aria-busy="true"
			class={GAYMOJI_GRID_CLASS}
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
		<StickerLoadFailure
			message="Couldn't load Gaymoji"
			onRetry={() => void load()}
		/>
	{/if}
</div>
