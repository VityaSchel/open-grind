<script lang="ts">
	import { t } from "#lib/i18n/index.ts";
	import type { Profile } from "#lib/model/users/profiles.ts";
	import type { PendingViewabilityChange } from "../profile-state.svelte";
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";
	import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

	let {
		ourProfile,
		profile,
		changingViewability,
		markBlocked,
		markHidden,
		onFavorite,
	}: {
		ourProfile: boolean;
		profile: Profile | null;
		changingViewability: boolean;
		markBlocked: () => PendingViewabilityChange;
		markHidden: () => PendingViewabilityChange;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();
</script>

{#if ourProfile || profile}
	<nav
		aria-label={t("profile.topNav.a11y.navigation")}
		class="absolute right-2 flex -translate-y-1/2 items-center gap-1.5"
	>
		{#if ourProfile}
			<EditProfileButton />
		{:else if profile}
			<ProfileActionsMenu
				profileId={profile.profileId}
				{changingViewability}
				{markBlocked}
				{markHidden}
			/>
			<FavoriteProfileToggle
				profileId={profile.profileId}
				isFavorite={profile.isFavorite}
				{onFavorite}
			/>
		{/if}
	</nav>
{/if}
