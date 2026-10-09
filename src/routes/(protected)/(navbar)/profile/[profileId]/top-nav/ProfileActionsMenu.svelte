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
	import { t } from "$lib/i18n";
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
				aria-label={t("profile.topNav.actionsMenu.a11y.trigger")}
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
					toast.success(t("profile.topNav.actionsMenu.idCopied"));
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: t(
							"profile.topNav.actionsMenu.errors.copyIdFailed",
						),
						error,
					});
				}
			}}
		>
			<CopyIcon class="size-5" />
			{t("profile.topNav.actionsMenu.copyId")}
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => (reportOpen = true)}>
			<FlagIcon class="size-5" />
			{t("profile.topNav.actionsMenu.report")}
		</DropdownMenu.Item>
		<DropdownMenu.Item
			onSelect={() =>
				applyViewabilityChange({
					change: markHidden,
					request: () => hideUser({ profileId }),
					failureLabel: t("profile.viewability.errors.hideFailed"),
				})}
		>
			<EyeSlashIcon class="size-5" />
			{t("profile.topNav.actionsMenu.hide")}
		</DropdownMenu.Item>
		{#if blockable}
			<DropdownMenu.Item
				onSelect={() =>
					applyViewabilityChange({
						change: markBlocked,
						request: () => blockUser({ profileId }),
						failureLabel: t(
							"profile.viewability.errors.blockFailed",
						),
					})}
			>
				<ProhibitIcon class="size-5" />
				{t("profile.topNav.actionsMenu.block")}
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
