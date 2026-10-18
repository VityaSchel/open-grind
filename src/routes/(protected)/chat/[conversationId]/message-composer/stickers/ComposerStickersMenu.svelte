<script lang="ts">
	import GifIcon from "phosphor-svelte/lib/GifIcon";
	import SmileyIcon from "phosphor-svelte/lib/SmileyIcon";
	import { untrack } from "svelte";

	import poweredByGiphyBoxed from "$lib/assets/giphy/powered-by-giphy-boxed.png";
	import poweredByGiphy from "$lib/assets/giphy/powered-by-giphy.png";
	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import MediaSheetTab from "$lib/components/media-sheet/MediaSheetTab.svelte";
	import MediaSheetTabBar from "$lib/components/media-sheet/MediaSheetTabBar.svelte";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { giphyConsented } from "../../giphy/giphy-consent";
	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import ComposerGaymojiTab from "./gaymoji/ComposerGaymojiTab.svelte";
	import ComposerGifTab from "./gifs/ComposerGifTab.svelte";
	import type { StickerPick } from "./sticker-pick";

	type StickerTab = "gifs" | "gaymoji";

	let {
		open = $bindable(),
		onCloseAutoFocus,
	}: { open: boolean; onCloseAutoFocus?: (event: Event) => void } = $props();

	const SEND_LABELS: Record<StickerTab, string> = {
		gifs: "Send GIF",
		gaymoji: "Send Gaymoji",
	};

	const composer = getMessageComposerContext();

	let selectedTab = $state<StickerTab>("gifs");
	let picks = $state.raw<Partial<Record<StickerTab, StickerPick>>>({});
	let sheetBody = $state<ReturnType<typeof MediaSheetBody> | null>(null);

	const picked = $derived(picks[selectedTab]);
	const consented = $derived(giphyConsented());
	const fullsize = $derived(selectedTab === "gaymoji" || consented);

	const contentOffsets: Partial<Record<StickerTab, number>> = {};

	$effect(() => {
		if (open) return;
		picks = {};
	});

	$effect(() => {
		const offset = contentOffsets[selectedTab] ?? 0;
		untrack(() => sheetBody?.restoreContentScrollTop(offset));
	});

	function selectTab(tab: StickerTab) {
		contentOffsets[selectedTab] = sheetBody?.contentScrollTop() ?? 0;
		selectedTab = tab;
	}

	function toggle({ tab, pick }: { tab: StickerTab; pick: StickerPick }) {
		picks = {
			...picks,
			[tab]: picks[tab]?.id === pick.id ? undefined : pick,
		};
	}

	function restartGifFeed() {
		picks = { ...picks, gifs: undefined };
		sheetBody?.scrollContentToTop();
	}

	function submit() {
		const pick = picked;
		open = false;
		if (pick === undefined) return;
		void composer().sendMessages([draftFromMessage(pick.message)]);
	}
</script>

<MediaSheet bind:open {fullsize} {onCloseAutoFocus}>
	<Drawer.Title class="sr-only">GIFs and stickers</Drawer.Title>
	<Tabs.Root
		bind:value={() => selectedTab, selectTab}
		class={["min-h-0 gap-0", { "h-full": fullsize }]}
	>
		<MediaSheetBody bind:this={sheetBody} {fullsize}>
			<Tabs.Content
				value="gifs"
				class="flex-1 flex-col data-[state=active]:flex"
			>
				<ComposerGifTab
					active={selectedTab === "gifs"}
					pickedId={picks.gifs?.id ?? null}
					onPick={(pick) => toggle({ tab: "gifs", pick })}
					onFeedRestart={restartGifFeed}
					onSearchFocus={() => sheetBody?.expand()}
				/>
			</Tabs.Content>
			<Tabs.Content
				value="gaymoji"
				class="flex-1 flex-col data-[state=active]:flex"
			>
				<ComposerGaymojiTab
					active={selectedTab === "gaymoji"}
					pickedId={picks.gaymoji?.id ?? null}
					onPick={(pick) => toggle({ tab: "gaymoji", pick })}
					holdSheetSize={() => sheetBody?.holdSize() ?? (() => {})}
				/>
			</Tabs.Content>
		</MediaSheetBody>

		<MediaSheetActions
			aboveTabBar
			label={SEND_LABELS[selectedTab]}
			count={picked === undefined ? 0 : 1}
			showCount={false}
			onSubmit={submit}
		/>

		<MediaSheetTabBar
			trailing={selectedTab === "gifs" && consented
				? giphyAttribution
				: undefined}
		>
			<MediaSheetTab value="gifs">
				<GifIcon weight="fill" class="size-5" />
				GIFs
			</MediaSheetTab>
			<MediaSheetTab value="gaymoji">
				<SmileyIcon class="size-5" />
				Gaymoji
			</MediaSheetTab>
		</MediaSheetTabBar>
	</Tabs.Root>
</MediaSheet>

{#snippet giphyAttribution()}
	<div data-slot="gif-attribution" class="w-20 max-w-full">
		<img
			src={poweredByGiphy}
			alt="Powered by GIPHY"
			class="hidden w-full dark:block"
		/>
		<img
			src={poweredByGiphyBoxed}
			alt="Powered by GIPHY"
			class="block w-full dark:hidden"
		/>
	</div>
{/snippet}
