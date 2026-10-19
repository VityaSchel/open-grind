<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";

	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import MediaSheetTab from "$lib/components/media-sheet/MediaSheetTab.svelte";
	import MediaSheetTabBar from "$lib/components/media-sheet/MediaSheetTabBar.svelte";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import { Toggle } from "$lib/components/ui/toggle";
	import { t } from "$lib/i18n";
	import { formatNumber } from "$lib/i18n/format";
	import ComposerAlbumsTab from "./albums/ComposerAlbumsTab.svelte";
	import ComposerUnimplementedTab from "./ComposerUnimplementedTab.svelte";
	import ComposerMediaTab from "./media/ComposerMediaTab.svelte";
	import {
		selectionActionKeys,
		type SelectionTab,
		type Tab,
		tabLabelKeys,
		type TabSelection,
	} from "./tabs";

	const FULLSIZE_TABS: Tab[] = ["media", "albums"];
	const EXPIRING_PHOTO_SECONDS = 10;

	let {
		open = $bindable(),
		onCloseAutoFocus,
	}: { open: boolean; onCloseAutoFocus?: (event: Event) => void } = $props();

	let selectedTab = $state<Tab>("media");

	const isFullsizeTab = $derived(FULLSIZE_TABS.includes(selectedTab));

	let tabs = $state<Partial<Record<Tab, SelectionTab | null>>>({});
	let selections = $state<Partial<Record<Tab, TabSelection>>>({});
	let expiring = $state(false);

	const selection = $derived(selections[selectedTab]);

	function submitSelection() {
		tabs[selectedTab]?.submitSelection();
	}

	$effect(() => {
		if (open) return;
		selections = {};
		expiring = false;
	});
</script>

<MediaSheet bind:open fullsize={isFullsizeTab} {onCloseAutoFocus}>
	<Drawer.Title class="sr-only">
		{t("chat.composer.attachments.a11y.title")}
	</Drawer.Title>
	<Tabs.Root
		bind:value={selectedTab}
		class={["min-h-0 gap-0", { "h-full": isFullsizeTab }]}
	>
		<MediaSheetBody fullsize={isFullsizeTab}>
			<Tabs.Content value="media">
				<ComposerMediaTab
					bind:this={tabs.media}
					{expiring}
					onSelectionChange={(mediaSelection) =>
						(selections.media = mediaSelection)}
					onClose={() => (open = false)}
				/>
			</Tabs.Content>
			<Tabs.Content value="albums">
				<ComposerAlbumsTab
					bind:this={tabs.albums}
					onSelectionChange={(albumSelection) =>
						(selections.albums = albumSelection)}
					onClose={() => (open = false)}
				/>
			</Tabs.Content>
			<Tabs.Content value="location">
				<ComposerUnimplementedTab
					message="chat.composer.attachments.location.unimplemented"
					issue={35}
				/>
			</Tabs.Content>
		</MediaSheetBody>

		<MediaSheetActions
			aboveTabBar
			label={selection === undefined
				? ""
				: t(selectionActionKeys[selection.action])}
			count={selection?.count ?? 0}
			onSubmit={submitSelection}
		>
			{#snippet leading()}
				{#if selectedTab === "media"}
					<Toggle
						aria-label={t(
							"chat.composer.attachments.expiring.a11y.toggle",
							{ count: EXPIRING_PHOTO_SECONDS },
						)}
						size="lg"
						class={{
							"bg-muted hover:bg-muted/80": !expiring,
							"bg-popover-foreground! text-popover hover:bg-popover-foreground/80! hover:text-popover":
								expiring,
						}}
						variant="default"
						bind:pressed={expiring}
					>
						<TimerIcon
							weight={expiring ? "fill" : "regular"}
							class="size-5"
						/>
						{#if expiring}
							{formatNumber({
								value: EXPIRING_PHOTO_SECONDS,
								preset: "durationSeconds",
							})}
						{:else}
							{t("chat.composer.attachments.expiring.off")}
						{/if}
					</Toggle>
				{/if}
			{/snippet}
		</MediaSheetActions>

		<MediaSheetTabBar>
			<MediaSheetTab value="media">
				<ImageIcon weight="fill" class="size-5" />
				{t(tabLabelKeys.media)}
			</MediaSheetTab>
			<MediaSheetTab value="albums">
				<FolderOpenIcon weight="fill" class="size-5" />
				{t(tabLabelKeys.albums)}
			</MediaSheetTab>
			<MediaSheetTab value="location">
				<NavigationArrowIcon weight="fill" class="size-5" />
				{t(tabLabelKeys.location)}
			</MediaSheetTab>
		</MediaSheetTabBar>
	</Tabs.Root>
</MediaSheet>
