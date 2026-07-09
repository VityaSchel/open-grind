<script lang="ts">
	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import type { ViewerProfile } from "$lib/model/interest/views";

	let {
		view,
	}: {
		view: ViewerProfile;
	} = $props();
</script>

<ProfileMiniCard
	mediaHash={view.profileImageMediaHash}
	displayName={view.displayName}
	distance={view.distance}
	onlineUntil={view.onlineUntil}
	isFavorite={view.isFavorite}
	href="/profile/{view.profileId}"
/>
