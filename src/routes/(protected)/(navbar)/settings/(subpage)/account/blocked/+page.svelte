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
	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
	import { t } from "$lib/i18n";
</script>

<svelte:head>
	<title>{t("settings.subpage.titles.blocked")}</title>
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
	label={t("settings.blocked.a11y.toggle")}
	errorLabel={{
		turningOn: t("profile.viewability.errors.blockFailed"),
		turningOff: t("profile.viewability.errors.unblockFailed"),
	}}
	empty={{
		title: t("settings.blocked.empty.title"),
		description: t("settings.blocked.empty.description"),
	}}
/>
