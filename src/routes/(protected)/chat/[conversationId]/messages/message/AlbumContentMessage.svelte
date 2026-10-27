<script lang="ts">
	import fireEmoji from "$lib/assets/emojis/fire/72px.png";
	import AlbumPreview from "$lib/components/album/AlbumPreview.svelte";
	import type {
		AlbumContentReactionMessage,
		AlbumContentReplyMessage,
	} from "$lib/model/messaging/messages";
	import { AlbumMessageState } from "./album-message.svelte";
	import { getMessageMetaContext, messageRef } from "./context";
	import LockedMedia from "./LockedMedia.svelte";
	import { mediaRenewal } from "./media-renewal";
	import MessageBubble from "./MessageBubble.svelte";
	import MessageQuote from "./MessageQuote.svelte";
	import { singleClick } from "./single-click";

	let {
		message,
	}: {
		message:
			| AlbumContentReplyMessage["body"]
			| AlbumContentReactionMessage["body"];
	} = $props();
	const isReply = $derived("albumContentReply" in message);

	const renewMedia = mediaRenewal();
	const ref = messageRef();
	const { adornments } = $derived(getMessageMetaContext()());
	const album = new AlbumMessageState({ message: () => message });
</script>

<MessageQuote>
	{#if album.isViewable}
		<AlbumPreview
			albumId={message.albumId}
			albumContentId={message.albumContentId}
			coverUrl={message.previewUrl}
			hasPhoto={false}
			hasVideo={false}
			label={isReply
				? "Open replied album content"
				: "Open reacted album content"}
			class="block aspect-3/4 w-32 rounded-lg"
			onexpired={renewMedia}
			attach={singleClick}
			onreact={album.canReply ? album.react : undefined}
			onreply={album.canReply ? album.reply : undefined}
		/>
	{:else}
		<div
			class="aspect-3/4 w-32"
			role="img"
			aria-label="Album content unavailable"
		>
			<LockedMedia class="rounded-lg" />
		</div>
	{/if}
</MessageQuote>

{#if "albumContentReply" in message}
	<MessageBubble tone="sent">
		<span class="wrap-anywhere whitespace-pre-wrap"
			>{message.albumContentReply}</span
		>
	</MessageBubble>
{:else}
	<div class="relative w-fit p-2" {@attach ref}>
		<img
			src={fireEmoji}
			alt="Fire reaction"
			width="48"
			height="48"
			draggable="false"
		/>
		{@render adornments?.()}
	</div>
{/if}
