<script lang="ts">
	import { CheckCircleIcon, ShareNetworkIcon } from "phosphor-svelte";

	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
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
			<ResponsiveDialog.Title>Shared with</ResponsiveDialog.Title>
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
				label="Sharing"
				errorLabel={{
					turningOn: "Couldn't share album",
					turningOff: "Couldn't unshare album",
				}}
				empty={{
					title: "Not shared yet",
					description:
						"People you share this album with appear here.",
				}}
			/>
		</ResponsiveDialog.Body>
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
