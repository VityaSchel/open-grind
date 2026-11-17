<script lang="ts">
	import { untrack } from "svelte";

	import {
		type GaymojiCategory,
		getGaymoji,
	} from "#lib/api/messaging/gaymoji.ts";
	import { gaymojiSections } from "#lib/chat/gaymoji-sections.ts";
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
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
	const tiles = new RovingFocusState({
		keys: () => tileKeys,
		orientation: "grid",
		columns: () => windows.columns,
		sectionStarts: () => sectionStarts,
		wrap: "rows",
		pageRows: () => windows.rowsPerPage(strip),
		reveal: (index) => revealTile(index),
	});

	let manifest = $state.raw<Manifest>({ status: "idle" });
	let content = $state<HTMLElement | null>(null);
	let strip = $state<HTMLElement | null>(null);

	const sections = $derived(
		manifest.status === "ready" ? gaymojiSections(manifest.categories) : [],
	);
	const sectionStarts = $derived.by(() => {
		let start = 0;
		return sections.map(({ items }) => {
			const sectionStart = start;
			start += items.length;
			return sectionStart;
		});
	});
	const tileKeys = $derived(
		sections.flatMap(({ items }) => items).map((_, index) => index),
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

	function revealTile(index: number) {
		const section = sectionStarts.findLastIndex((start) => start <= index);
		if (section < 0) return;
		windows.revealItem({
			key: sections[section]!.key,
			index: index - sectionStarts[section]!,
			stickyTop: strip,
		});
	}

	function jumpToSection(key: string) {
		scroll.jumpTo(key);
		const section = sections.findIndex(
			(candidate) => candidate.key === key,
		);
		tiles.activeKey = sectionStarts[section] ?? tiles.activeKey;
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
			onPick={jumpToSection}
		/>
		<div {@attach tiles.container} data-slot="gaymoji-sections">
			{#each sections as section, sectionIndex (section.key)}
				<GaymojiSection
					{section}
					firstIndex={sectionStarts[sectionIndex]!}
					headers={scroll.headers}
					{windows}
					{tiles}
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
		</div>
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
			message={t("chat.composer.stickers.gaymoji.errors.loadFailed")}
			onRetry={() => void load()}
		/>
	{/if}
</div>
