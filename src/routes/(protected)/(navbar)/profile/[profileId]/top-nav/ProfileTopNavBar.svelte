<script lang="ts">
	import type { Profile } from "$lib/model/users/profiles";
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";
	import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

	let {
		ourProfile,
		profile,
		onBlocked,
		onHidden,
		onFavorite,
	}: {
		ourProfile: boolean;
		profile: Profile | null;
		onBlocked: () => void;
		onHidden: () => void;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();
</script>

{#if ourProfile || profile}
	<nav
		aria-label="Profile actions"
		class="absolute right-2 flex -translate-y-1/2 flex-row-reverse items-center gap-1.5"
	>
		{#if ourProfile}
			<EditProfileButton />
		{:else if profile}
			<FavoriteProfileToggle
				profileId={profile.profileId}
				isFavorite={profile.isFavorite}
				{onFavorite}
			/>
			<ProfileActionsMenu
				profileId={profile.profileId}
				blockable={profile.isBlockable !== false}
				{onBlocked}
				{onHidden}
			/>
		{/if}
	</nav>
{/if}
