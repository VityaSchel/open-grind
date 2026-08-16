<script lang="ts">
	import EditProfileButton from "./EditProfileButton.svelte";
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";
	import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

	let {
		ourProfileId,
		profile,
		onBlocked,
		onHidden,
		onFavorite,
	}: {
		ourProfileId: number;
		profile: import("$lib/model/users/profiles").Profile;
		onBlocked: () => void;
		onHidden: () => void;
		onFavorite: (isFavorite: boolean) => void;
	} = $props();

	const profileId = $derived(profile.profileId);
	const isOurProfile = $derived(profileId === ourProfileId);
</script>

<nav
	class="absolute right-2 flex -translate-y-1/2 flex-row-reverse items-center gap-1.5"
>
	{#if isOurProfile}
		<EditProfileButton />
	{:else}
		<FavoriteProfileToggle
			{profileId}
			isFavorite={profile.isFavorite}
			{onFavorite}
		/>
		<ProfileActionsMenu {profileId} {onBlocked} {onHidden} />
	{/if}
</nav>
