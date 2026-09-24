<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";

	import MediaSheet from "$lib/components/media-sheet/MediaSheet.svelte";
	import MediaSheetActions from "$lib/components/media-sheet/MediaSheetActions.svelte";
	import MediaSheetBody from "$lib/components/media-sheet/MediaSheetBody.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import { Toggle } from "$lib/components/ui/toggle";
	import ComposerAlbumsTab from "./albums/ComposerAlbumsTab.svelte";
	import ComposerUnimplementedTab from "./ComposerUnimplementedTab.svelte";
	import ComposerMediaTab from "./media/ComposerMediaTab.svelte";
	import type { SelectionTab, Tab, TabSelection } from "./tabs";

	const FULLSIZE_TABS: Tab[] = ["media", "albums"];

	let { open = $bindable() }: { open: boolean } = $props();

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

<MediaSheet bind:open fullsize={isFullsizeTab}>
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
				<ComposerUnimplementedTab label="Sharing location" issue={35} />
			</Tabs.Content>
		</MediaSheetBody>

		<MediaSheetActions
			visible={selection !== undefined && selection.count > 0}
			class="bottom-18"
		>
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
			<Button size="lg" class="shadow-lg" onclick={submitSelection}>
				{selection?.label}
				<Badge
					variant="secondary"
					class="bg-primary-foreground/10 text-primary-foreground"
				>
					{selection?.count}
				</Badge>
			</Button>
		</MediaSheetActions>

		<Drawer.Footer
			class="absolute inset-x-0 bottom-0 items-center rounded-b-4xl pt-1 pb-2 select-none"
		>
			<Tabs.List>
				{@render tab("media")}
				{@render tab("albums")}
				{@render tab("location")}
			</Tabs.List>
		</Drawer.Footer>
	</Tabs.Root>
</MediaSheet>

{#snippet tab(tab: Tab)}
	<Tabs.Trigger value={tab} class="h-auto flex-col gap-0.5 px-4 py-1.5">
		{#if tab === "media"}
			<ImageIcon weight="fill" class="size-5" />
			Media
		{:else if tab === "albums"}
			<FolderOpenIcon weight="fill" class="size-5" />
			Albums
		{:else if tab === "location"}
			<NavigationArrowIcon weight="fill" class="size-5" />
			Location
		{/if}
	</Tabs.Trigger>
{/snippet}
