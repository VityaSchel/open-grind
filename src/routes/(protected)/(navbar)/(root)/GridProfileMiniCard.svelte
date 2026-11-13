<script lang="ts">
	import { goto } from "$app/navigation";

	import ProfileMiniCard from "#lib/components/profile/ProfileMiniCard.svelte";
	import { isPlainClick } from "#lib/util/plain-click.ts";
	import type { RightNowStatus } from "#lib/model/right-now/index.ts";

	let {
		id,
		displayName = null,
		age = null,
		distance = null,
		medias = null,
		unread = null,
		onlineUntil = null,
		isFavorite = false,
		isVisiting = false,
		hadRecentChat = false,
		rightNow = "NOT_ACTIVE",
	}: {
		id: number;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		medias?: { mediaHash: string }[] | null;
		unread?: number | null;
		onlineUntil?: number | null;
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
		rightNow?: RightNowStatus;
	} = $props();

	function openInPager(event: MouseEvent) {
		if (!isPlainClick(event)) return;
		event.preventDefault();
		void goto(`/profile/${id}`, { state: { profileOrigin: "browse" } });
	}
</script>

<ProfileMiniCard
	mediaHash={medias?.[0]?.mediaHash ?? null}
	{displayName}
	{age}
	{distance}
	{unread}
	{onlineUntil}
	{isFavorite}
	{isVisiting}
	{hadRecentChat}
	{rightNow}
	href="/profile/{id}"
	onclick={openInPager}
/>
