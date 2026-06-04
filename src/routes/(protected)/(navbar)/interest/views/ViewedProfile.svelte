<script lang="ts">
	import ProfileMiniCard from "$lib/components/ProfileMiniCard.svelte";
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
	href="/profile/{view.profileId}"
/>
