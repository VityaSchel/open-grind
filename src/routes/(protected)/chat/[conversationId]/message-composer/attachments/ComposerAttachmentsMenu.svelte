<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import TimerIcon from "phosphor-svelte/lib/TimerIcon";
	import { expoOut, sineIn } from "svelte/easing";
	import { fly } from "svelte/transition";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import { Toggle } from "$lib/components/ui/toggle";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import ComposerAlbumsTab from "./ComposerAlbumsTab.svelte";
	import ComposerMediaTab from "./ComposerMediaTab.svelte";
	import ComposerUnimplementedTab from "./ComposerUnimplementedTab.svelte";

	const FULLSIZE_TABS: Tab[] = ["media", "albums"];

	let { open = $bindable() }: { open: boolean } = $props();

	type Tab = "media" | "albums" | "location";
	type SelectionTab = { sendSelected: () => void };

	let selectedTab = $state<Tab>("media");

	const isFullsizeTab = $derived(FULLSIZE_TABS.includes(selectedTab));

	let sheet = $state<HTMLDivElement | null>(null);
	let peek = $state<HTMLDivElement | null>(null);
	let tabs = $state<Partial<Record<Tab, SelectionTab | null>>>({});
	let counts = $state<Partial<Record<Tab, number>>>({});
	let expiring = $state(false);

	const selectedCount = $derived(counts[selectedTab] ?? 0);

	function sendSelected() {
		tabs[selectedTab]?.sendSelected();
	}

	const settleQuietMs = 140;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;

	function settleToNearestSize() {
		const el = sheet;
		const range = peek?.offsetHeight ?? 0;
		if (!el || el.scrollTop <= 0 || el.scrollTop >= range) return;
		el.scrollTo({
			top: el.scrollTop < range / 2 ? 0 : range,
			behavior: "smooth",
		});
	}

	function scheduleSettle() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			settleTimer = null;
			settleToNearestSize();
		}, settleQuietMs);
	}

	$effect(() => {
		if (open) return;
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
		counts = {};
		expiring = false;
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<Drawer.Root bind:open>
	<Drawer.Content
		class={[
			"mx-auto max-w-200 border-none bg-transparent p-0 shadow-none before:hidden",
			{ "h-full": isFullsizeTab, "h-fit": !isFullsizeTab },
		]}
		handle={null}
		onclick={(e) => {
			if (
				e.target instanceof HTMLDivElement &&
				e.target.dataset.slot === "sheet-scroller"
			) {
				open = false;
			}
		}}
		preventOverflowTextSelection={false}
	>
		<Tabs.Root
			bind:value={selectedTab}
			class={["min-h-0 gap-0", { "h-full": isFullsizeTab }]}
		>
			<div
				bind:this={sheet}
				data-slot="sheet-scroller"
				onscroll={scheduleSettle}
				class={[
					"overflow-x-hidden  overscroll-contain select-none",
					{
						"h-full overflow-y-auto": isFullsizeTab,
						"h-fit": !isFullsizeTab,
					},
				]}
			>
				{#if isFullsizeTab}
					<div
						bind:this={peek}
						data-slot="sheet-peek"
						class="pointer-events-none h-2/5"
					></div>
				{/if}
				<div
					data-slot="sheet-panel"
					class={[
						" rounded-t-4xl border border-border bg-popover px-4 pb-20 shadow-xl",
						{ "min-h-full": isFullsizeTab },
					]}
				>
					<div
						data-slot="drawer-handle"
						class="mx-auto my-3 h-1.5 w-25 rounded-full bg-muted"
					></div>
					<Tabs.Content value="media">
						<ComposerMediaTab
							bind:this={tabs.media}
							{expiring}
							onSelectionChange={(count) =>
								(counts.media = count)}
							onClose={() => (open = false)}
						/>
					</Tabs.Content>
					<Tabs.Content value="albums">
						<ComposerAlbumsTab
							bind:this={tabs.albums}
							onSelectionChange={(count) =>
								(counts.albums = count)}
							onClose={() => (open = false)}
						/>
					</Tabs.Content>
					<Tabs.Content value="location">
						<ComposerUnimplementedTab
							label="Sharing location"
							issue={35}
						/>
					</Tabs.Content>
				</div>
			</div>

			{#if selectedCount > 0}
				<div
					class="pointer-events-none absolute inset-x-0 bottom-18 flex justify-center gap-2"
					in:fly={{ duration: 600, y: 100, easing: expoOut }}
					out:fly={{ duration: 400, y: 100, easing: sineIn }}
				>
					{#if selectedTab === "media"}
						<Toggle
							aria-label="Set photo as expiring after 10 seconds"
							size="lg"
							class={[
								"pointer-events-auto",
								{
									"bg-muted hover:bg-muted/80": !expiring,
									"bg-popover-foreground! text-popover hover:bg-popover-foreground/80! hover:text-popover":
										expiring,
								},
							]}
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
					<Button
						size="lg"
						class="pointer-events-auto shadow-lg"
						onclick={sendSelected}
					>
						Send
						<Badge
							variant="secondary"
							class="bg-primary-foreground/10 text-primary-foreground"
						>
							{selectedCount}
						</Badge>
					</Button>
				</div>
			{/if}

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
	</Drawer.Content>
</Drawer.Root>

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
