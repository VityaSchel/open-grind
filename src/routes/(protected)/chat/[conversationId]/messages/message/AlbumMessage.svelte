<script lang="ts">
	import { albumShares } from "$lib/chat/album-shares.svelte";
	import AlbumPreview from "$lib/components/album/AlbumPreview.svelte";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { getConversationState } from "../../conversation-state.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const conversationState = $derived(getConversationState()());
	const peerProfileId = $derived(
		conversationState.profile?.profileId ?? null,
	);
	const isViewable = $derived.by(() => {
		if (peerProfileId === null) return message.isViewable;
		return (
			albumShares.isSharedWith({
				albumId: message.albumId,
				profileId: peerProfileId,
			}) ?? message.isViewable
		);
	});

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60 ms-3": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);
</script>

{#if isViewable}
	<AlbumPreview
		albumId={message.albumId}
		coverUrl={message.coverUrl}
		hasPhoto={message.hasPhoto}
		hasVideo={message.hasVideo}
		class={className}
		{contentClass}
		attach={media.attach}
	>
		{@render media.adornments?.()}
	</AlbumPreview>
{:else}
	<div
		data-slot="locked-album"
		class={[className, contentClass, "relative"]}
		{@attach media.attach}
	>
		<LockedMedia class={media.cornerClass} />
		{@render media.adornments?.()}
	</div>
{/if}
