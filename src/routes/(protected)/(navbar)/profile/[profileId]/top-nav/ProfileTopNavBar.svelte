<script lang="ts">
	import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";

	let {
		ourProfileId,
		profileId,
		profile,
	}: {
		ourProfileId: number;
		profileId: number;
		profile: import("$lib/model/profile").Profile;
	} = $props();

	const isOurProfile = $derived(profileId === ourProfileId);
</script>

<nav
	class="absolute -translate-y-1/2 right-2 flex flex-row-reverse items-center gap-1.5"
>
	{#if !isOurProfile}
		<FavoriteProfileToggle {profileId} isFavorite={profile.isFavorite} />
	{/if}
</nav>
