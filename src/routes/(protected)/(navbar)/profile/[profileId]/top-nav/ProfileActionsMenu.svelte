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
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { PendingViewabilityChange } from "../profile-state.svelte";

	let {
		profileId,
		blockable,
		submitting,
		markBlocked,
		markHidden,
	}: {
		profileId: number;
		blockable: boolean;
		submitting: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
	} = $props();

	let reportOpen = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger disabled={submitting}>
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
			onSelect={async () => {
				const { revert, settle } = markHidden();
				try {
					await hideUser({ profileId });
					settle();
				} catch (error) {
					revert();
					console.error(error);
					showErrorToast({ label: "Failed to hide user", error });
				}
			}}
		>
			<EyeSlashIcon class="size-5" />
			Hide profile
		</DropdownMenu.Item>
		{#if blockable}
			<DropdownMenu.Item
				onSelect={async () => {
					const { revert, settle } = markBlocked();
					try {
						await blockUser({ profileId });
						settle();
					} catch (error) {
						revert();
						console.error(error);
						showErrorToast({
							label: "Failed to block user",
							error,
						});
					}
				}}
			>
				<ProhibitIcon class="size-5" />
				Block profile
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<ReportSheet
	bind:open={reportOpen}
	{profileId}
	{blockable}
	onBlocked={() => markBlocked().settle()}
/>
