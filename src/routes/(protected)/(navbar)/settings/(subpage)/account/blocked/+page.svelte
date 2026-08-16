<script lang="ts" module>
	const scroll = { scrollY: 0 };
</script>

<script lang="ts">
	import { ProhibitIcon } from "phosphor-svelte";

	import {
		blockUser,
		getBlockedUsers,
		unblockUser,
	} from "$lib/api/browse/blocks";
	import ProfileList from "../profile-list/ProfileList.svelte";
</script>

<svelte:head>
	<title>Blocked users</title>
</svelte:head>

{#snippet icon(on: boolean)}
	<ProhibitIcon weight={on ? "fill" : "regular"} class="size-6" />
{/snippet}

<ProfileList
	loadIds={async () =>
		(await getBlockedUsers()).map(({ profileId }) => profileId)}
	setOn={({ profileId, on }) =>
		on ? blockUser({ profileId }) : unblockUser({ profileId })}
	{icon}
	{scroll}
	label="Blocked"
	errorLabel={{
		turningOn: "Failed to block",
		turningOff: "Failed to unblock",
	}}
	empty={{
		title: "No Blocked Users",
		description: "People you block will appear here.",
	}}
/>
