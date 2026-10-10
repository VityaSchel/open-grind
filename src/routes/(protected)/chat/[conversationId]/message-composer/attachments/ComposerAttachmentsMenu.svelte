<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";
	import { untrack } from "svelte";

	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import MediaSheetTab from "$lib/components/media-sheet/MediaSheetTab.svelte";
	import MediaSheetTabBar from "$lib/components/media-sheet/MediaSheetTabBar.svelte";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import { Toggle } from "$lib/components/ui/toggle";
	import { decodeGeohash } from "$lib/model/geohash";
	import type { Coordinates } from "$lib/location/location-request.svelte";
	import ComposerAlbumsTab from "./albums/ComposerAlbumsTab.svelte";
	import ComposerLocationTab from "./location/ComposerLocationTab.svelte";
	import ComposerMediaTab from "./media/ComposerMediaTab.svelte";
	import type { SelectionTab, Tab, TabSelection } from "./tabs";

	const FULLSIZE_TABS: Tab[] = ["media", "albums"];

	let {
		open = $bindable(),
		onCloseAutoFocus,
	}: { open: boolean; onCloseAutoFocus?: (event: Event) => void } = $props();

	const locationHintId = $props.id();

	let selectedTab = $state<Tab>("media");

	let tabs = $state<Partial<Record<Tab, SelectionTab | null>>>({});
	let selections = $state<Partial<Record<Tab, TabSelection>>>({});
	let expiring = $state(false);
	let locationPin: Coordinates | undefined = $state();

	const selection = $derived(selections[selectedTab]);
	const isFullsizeTab = $derived(FULLSIZE_TABS.includes(selectedTab));

	function submitSelection() {
		tabs[selectedTab]?.submitSelection();
	}

	$effect.pre(() => {
		if (open) {
			const geohash = untrack(() => preferencesSnapshot().geohash);
			locationPin = geohash ? decodeGeohash(geohash) : undefined;
			return;
		}
		selections = {};
		expiring = false;
	});
</script>

<MediaSheet bind:open fullsize={isFullsizeTab} {onCloseAutoFocus}>
	<Drawer.Title class="sr-only">Attachments</Drawer.Title>
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
			<Tabs.Content value="location" aria-describedby={locationHintId}>
				{#if selectedTab === "location"}
					<ComposerLocationTab
						bind:this={tabs.location}
						bind:pinPos={locationPin}
						hintId={locationHintId}
						onSelectionChange={(locationSelection) =>
							(selections.location = locationSelection)}
						onClose={() => (open = false)}
					/>
				{/if}
			</Tabs.Content>
		</MediaSheetBody>

		<MediaSheetActions
			aboveTabBar
			label={selection?.label ?? ""}
			count={selection?.count ?? 0}
			showCount={selectedTab !== "location"}
			onSubmit={submitSelection}
		>
			{#snippet leading()}
				{#if selectedTab === "media"}
					<Toggle
						aria-label="Set photo as expiring after 10 seconds"
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
							10s
						{:else}
							Off
						{/if}
					</Toggle>
				{/if}
			{/snippet}
		</MediaSheetActions>

		<MediaSheetTabBar>
			<MediaSheetTab value="media">
				<ImageIcon weight="fill" class="size-5" />
				Media
			</MediaSheetTab>
			<MediaSheetTab value="albums">
				<FolderOpenIcon weight="fill" class="size-5" />
				Albums
			</MediaSheetTab>
			<MediaSheetTab value="location">
				<NavigationArrowIcon weight="fill" class="size-5" />
				Location
			</MediaSheetTab>
		</MediaSheetTabBar>
	</Tabs.Root>
</MediaSheet>
