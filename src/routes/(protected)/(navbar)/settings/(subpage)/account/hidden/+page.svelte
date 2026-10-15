<script lang="ts" module>
	const scroll = { scrollY: 0 };
</script>

<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import {
		getHiddenUserIdsNewestFirst,
		hideUser,
		unhideUser,
	} from "$lib/api/browse/hides";
	import ProfileList from "$lib/components/profile-list/ProfileList.svelte";
	import { t } from "$lib/i18n";
</script>

<svelte:head>
	<title>{t("settings.subpage.titles.hidden")}</title>
</svelte:head>

{#snippet icon(on: boolean)}
	<EyeSlashIcon weight={on ? "fill" : "regular"} class="size-6" />
{/snippet}

<ProfileList
	eager
	loadIds={getHiddenUserIdsNewestFirst}
	setOn={({ profileId, on }) =>
		on ? hideUser({ profileId }) : unhideUser({ profileId })}
	{icon}
	{scroll}
	label={t("settings.hidden.a11y.toggle")}
	errorLabel={{
		turningOn: t("common.viewability.errors.hideFailed"),
		turningOff: t("common.viewability.errors.unhideFailed"),
	}}
	empty={{
		title: t("settings.hidden.empty.title"),
		description: t("settings.hidden.empty.description"),
	}}
/>
