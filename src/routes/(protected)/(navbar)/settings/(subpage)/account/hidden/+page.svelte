<script lang="ts" module>
	const scroll = { scrollY: 0 };
</script>

<script lang="ts">
	import { EyeSlashIcon } from "phosphor-svelte";

	import {
		getHiddenUsers,
		hideUser,
		unhideUser,
	} from "$lib/api/browse/hides";
	import ProfileList from "../profile-list/ProfileList.svelte";
</script>

<svelte:head>
	<title>Hidden users</title>
</svelte:head>

{#snippet icon(on: boolean)}
	<EyeSlashIcon weight={on ? "fill" : "regular"} class="size-6" />
{/snippet}

<ProfileList
	loadIds={async () =>
		(await getHiddenUsers()).map(({ profileId }) => profileId)}
	setOn={({ profileId, on }) =>
		on ? hideUser({ profileId }) : unhideUser({ profileId })}
	{icon}
	{scroll}
	label="Hidden"
	errorLabel={{ turningOn: "Failed to hide", turningOff: "Failed to unhide" }}
	empty={{
		title: "No Hidden Users",
		description: "People you hide will appear here.",
	}}
/>
