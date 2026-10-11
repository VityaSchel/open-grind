<script lang="ts">
	import { CheckCircleIcon, ShareNetworkIcon } from "phosphor-svelte";

	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
	import { t } from "$lib/i18n";
	import type { AlbumSharedWith } from "./shared-with-state.svelte";

	let {
		open = $bindable(),
		shares,
	}: { open: boolean; shares: AlbumSharedWith } = $props();
</script>

{#snippet icon(on: boolean)}
	<CheckCircleIcon weight={on ? "fill" : "regular"} class="size-6" />
{/snippet}
{#snippet emptyIcon()}
	<ShareNetworkIcon weight="fill" />
{/snippet}

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content
		class="flex flex-col"
		dialogClass="max-h-[calc(var(--screen-safe)-4rem)] sm:max-w-md"
		drawerClass="max-h-screen-safe"
		dialogProps={{ showCloseButton: true }}
	>
		<ResponsiveDialog.Header class="pb-2">
			<ResponsiveDialog.Title>
				{t("media.albums.sharedWith.title")}
			</ResponsiveDialog.Title>
		</ResponsiveDialog.Header>
		<ResponsiveDialog.Body
			data-slot="shared-with-list"
			class="flex flex-col"
			dialogClass="-mx-1 px-1"
			drawerClass="px-4 pb-4"
		>
			<ProfileList
				loadIds={() => shares.load()}
				setOn={({ profileId, on }) =>
					shares.setShared({ profileId, shared: on })}
				{icon}
				{emptyIcon}
				control="checkbox"
				skeletons={2}
				label={t("media.albums.sharedWith.a11y.sharing")}
				errorLabel={{
					turningOn: t("common.albumShare.errors.shareFailed"),
					turningOff: t("common.albumShare.errors.unshareFailed"),
				}}
				empty={{
					title: t("media.albums.sharedWith.empty.title"),
					description: t("media.albums.sharedWith.empty.description"),
				}}
			/>
		</ResponsiveDialog.Body>
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
