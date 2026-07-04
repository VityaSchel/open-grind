<script lang="ts">
	import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";

	import * as Drawer from "$lib/components/ui/drawer";
	import * as Tabs from "$lib/components/ui/tabs";
	import ComposerMediaTab from "./ComposerMediaTab.svelte";
	import ComposerUnimplementedTab from "./ComposerUnimplementedTab.svelte";

	let {
		open = $bindable(),
	}: {
		open: boolean;
	} = $props();

	const snapPoints = [0.6, 1];
	let activeSnapPoint = $state<number | string | null>(snapPoints[0]);
	const expanded = $derived(activeSnapPoint === snapPoints[1]);

	let drawerRef = $state<HTMLDivElement | null>(null);
	let tabsRef = $state<HTMLElement | null>(null);

	const tabsOverhead = 54;

	$effect(() => {
		const drawer = drawerRef;
		const tabs = tabsRef;
		if (!drawer || !tabs) return;
		let drawerHeight = 0;
		const observer = new MutationObserver(() => {
			if (!drawer.classList.contains("vaul-dragging")) {
				drawerHeight = 0;
				tabs.style.height = "";
				tabs.style.transition = "";
				return;
			}
			const translate = /translate3d\(0(?:px)?,\s*(-?[\d.]+)px/.exec(
				drawer.style.transform,
			);
			if (!translate) return;
			if (drawerHeight === 0) drawerHeight = drawer.offsetHeight;
			tabs.style.transition = "none";
			tabs.style.height = `${Math.max(drawerHeight - parseFloat(translate[1]) - tabsOverhead, 0)}px`;
		});
		observer.observe(drawer, {
			attributes: true,
			attributeFilter: ["style", "class"],
		});
		return () => observer.disconnect();
	});
</script>

<Drawer.Root bind:open {snapPoints} fadeFromIndex={0} bind:activeSnapPoint>
	<Drawer.Content
		bind:ref={drawerRef}
		class="mx-auto h-full max-w-200"
		preventOverflowTextSelection={false}
	>
		<Tabs.Root
			bind:ref={tabsRef}
			value="media"
			class={[
				"min-h-0 [transition:height_0.5s_cubic-bezier(0.32,0.72,0,1)]",
				expanded
					? "h-[calc(100%-1.375rem)]"
					: "h-[calc(60dvh-3.375rem-var(--safe-area-top)-var(--safe-area-bottom))]",
			]}
		>
			<Tabs.Content value="media" class="mt-2 flex min-h-0 flex-col">
				<ComposerMediaTab onClose={() => (open = false)} />
			</Tabs.Content>
			<Tabs.Content value="albums" class="flex min-h-0">
				<ComposerUnimplementedTab label="Sharing albums" issue={33} />
			</Tabs.Content>
			<Tabs.Content value="location" class="flex min-h-0">
				<ComposerUnimplementedTab label="Sharing location" issue={35} />
			</Tabs.Content>
			<Drawer.Footer class="items-center pt-1 pb-0">
				<Tabs.List>
					<Tabs.Trigger
						value="media"
						class="h-auto flex-col gap-0.5 px-4 py-1.5"
					>
						<ImageIcon weight="fill" class="size-5" />
						Media
					</Tabs.Trigger>
					<Tabs.Trigger
						value="albums"
						class="h-auto flex-col gap-0.5 px-4 py-1.5"
					>
						<FolderOpenIcon weight="fill" class="size-5" />
						Albums
					</Tabs.Trigger>
					<Tabs.Trigger
						value="location"
						class="h-auto flex-col gap-0.5 px-4 py-1.5"
					>
						<NavigationArrowIcon weight="fill" class="size-5" />
						Location
					</Tabs.Trigger>
				</Tabs.List>
			</Drawer.Footer>
		</Tabs.Root>
	</Drawer.Content>
</Drawer.Root>
