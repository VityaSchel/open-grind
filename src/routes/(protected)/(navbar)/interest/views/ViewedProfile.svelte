<script lang="ts">
	import ProfileMiniCard from "#lib/components/profile/ProfileMiniCard.svelte";
	import type { ViewerProfile } from "#lib/model/interest/views.ts";

	let {
		view,
		...attributes
	}: {
		view: ViewerProfile;
	} & import("svelte/elements").HTMLAttributes<HTMLDivElement> = $props();
</script>

<div {...attributes}>
	<ProfileMiniCard
		mediaHash={view.profileImageMediaHash}
		displayName={view.displayName}
		distance={view.distance}
		onlineUntil={view.onlineUntil}
		isFavorite={view.isFavorite}
		href="/profile/{view.profileId}"
		class="focus-ring-overlay rounded-[inherit]"
	/>
</div>
