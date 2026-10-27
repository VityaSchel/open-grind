<script lang="ts">
	import AlbumPreview from "$lib/components/album/AlbumPreview.svelte";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import { AlbumMessageState } from "./album-message.svelte";
	import LockedMedia from "./LockedMedia.svelte";
	import { mediaRenewal } from "./media-renewal";
	import { MessageMediaState } from "./message-media.svelte";
	import { singleClick } from "./single-click";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();
	const renewMedia = mediaRenewal();
	const album = new AlbumMessageState({ message: () => message });

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto",
		media.widthClass,
		{
			"ring ring-accent": message.hasUnseenContent,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);
</script>

{#if album.isViewable}
	<AlbumPreview
		albumId={message.albumId}
		coverUrl={message.coverUrl}
		hasPhoto={message.hasPhoto}
		hasVideo={message.hasVideo}
		class={className}
		{contentClass}
		attach={(element) => {
			const stopMedia = media.attach(element);
			const stopClick = singleClick(element);
			return () => {
				stopMedia?.();
				stopClick?.();
			};
		}}
		onexpired={renewMedia}
		onreply={album.canReply ? album.reply : undefined}
		onreact={album.canReply ? album.react : undefined}
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
