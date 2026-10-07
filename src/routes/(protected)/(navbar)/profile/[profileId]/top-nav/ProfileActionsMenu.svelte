<script lang="ts">
	import {
		CopyIcon,
		DotsThreeIcon,
		EyeSlashIcon,
		FlagIcon,
		ProhibitIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { blockUser } from "$lib/api/browse/blocks";
	import { hideUser } from "$lib/api/browse/hides";
	import { showErrorToast } from "$lib/api/error-toast";
	import BlockingGuideLink from "$lib/components/report/BlockingGuideLink.svelte";
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "../profile-state.svelte";

	let {
		profileId,
		blockable,
		changingViewability,
		markBlocked,
		markHidden,
	}: {
		profileId: number;
		blockable: boolean;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
	} = $props();

	let reportOpen = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger disabled={changingViewability}>
		{#snippet child({ props: { class: className, ...props } })}
			<Button
				size="icon-lg"
				variant="secondary"
				aria-label="Profile menu"
				class={[className, "size-12"]}
				{...props}
			>
				<DotsThreeIcon class="size-8" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-42" align="end">
		<DropdownMenu.Item
			onSelect={async () => {
				try {
					const clipboard =
						await import("@tauri-apps/plugin-clipboard-manager");
					await clipboard.writeText(String(profileId));
					toast.success("Profile ID copied to clipboard");
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: "Failed to copy profile ID",
						error,
					});
				}
			}}
		>
			<CopyIcon class="size-5" />
			Copy profile ID
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => (reportOpen = true)}>
			<FlagIcon class="size-5" />
			Report profile
		</DropdownMenu.Item>
		<DropdownMenu.Item
			onSelect={() =>
				applyViewabilityChange({
					change: markHidden,
					request: () => hideUser({ profileId }),
					failureLabel: "Failed to hide user",
				})}
		>
			<EyeSlashIcon class="size-5" />
			Hide profile
		</DropdownMenu.Item>
		<div class="flex items-center">
			<DropdownMenu.Item
				disabled={!blockable}
				class="flex-1"
				onSelect={() =>
					applyViewabilityChange({
						change: markBlocked,
						request: () => blockUser({ profileId }),
						failureLabel: "Failed to block user",
					})}
			>
				<ProhibitIcon class="size-5" />
				Block profile
			</DropdownMenu.Item>
			{#if !blockable}
				<DropdownMenu.Item
					class="me-2 size-7 cursor-pointer justify-center rounded-full p-0"
				>
					{#snippet child({ props })}
						<BlockingGuideLink {...props} />
					{/snippet}
				</DropdownMenu.Item>
			{/if}
		</div>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<ReportSheet
	bind:open={reportOpen}
	{profileId}
	{blockable}
	onBlock={async () => {
		await blockUser({ profileId });
		markBlocked().settle();
	}}
/>
