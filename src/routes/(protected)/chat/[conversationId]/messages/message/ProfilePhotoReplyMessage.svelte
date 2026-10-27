<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { mediaHashPublicSchema } from "$lib/model/media";
	import {
		draftFromMessage,
		type ProfilePhotoReplyMessage,
	} from "$lib/model/messaging/messages";
	import { profileMediaUrl } from "$lib/util/media";
	import { openLightbox } from "$lib/util/photoswipe";
	import { applyProfilePhotoReply } from "$lib/util/photoswipe/profile-photo-reply";
	import { getConversationState } from "../../conversation-state.svelte";
	import MessageBubble from "./MessageBubble.svelte";
	import MessageQuote from "./MessageQuote.svelte";

	let {
		message,
		isOut,
	}: { message: ProfilePhotoReplyMessage["body"]; isOut: boolean } = $props();

	const conversationState = getConversationState();
	const src = $derived.by(() => {
		const hash = mediaHashPublicSchema.safeParse(message.imageHash);
		return hash.success
			? profileMediaUrl({ mediaHash: hash.data, size: "full" })
			: null;
	});
	let open = $state(false);
	let loading = $state(false);
	let image: HTMLImageElement | undefined;
	$effect(() => {
		if (!open || src === null) return;
		const controller = new AbortController();
		const loaded = image?.getAttribute("src") === src ? image : undefined;
		openLightbox({
			items: [
				{
					src,
					width: loaded?.naturalWidth,
					height: loaded?.naturalHeight,
				},
			],
			configure: (lightbox) => {
				lightbox.on("openingAnimationEnd", () => (loading = false));
				if (isOut) {
					applyProfilePhotoReply(lightbox, {
						imageHash: () => message.imageHash,
						onreply: ({ imageHash, text }) =>
							conversationState().send(
								[
									draftFromMessage({
										type: "ProfilePhotoReply",
										body: {
											imageHash,
											photoContentReply: text,
										},
									}),
								],
								{ includeReply: false },
							),
					});
				}
			},
			signal: controller.signal,
			onClosed: () => {
				open = false;
				loading = false;
			},
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			showErrorToast({ label: "Failed to open profile photo", error });
			open = false;
			loading = false;
		});
		return () => controller.abort();
	});
</script>

<MessageQuote>
	<button
		aria-label="Open replied profile photo"
		class={[
			"block aspect-3/4 w-32 overflow-hidden rounded-lg",
			{ "opacity-50": loading },
		]}
		onclick={() => {
			loading = true;
			open = true;
		}}
		disabled={src === null || open}
	>
		<MediaImage
			{src}
			class="size-full"
			imgClass="bg-card-foreground/10"
			onload={(loaded) => (image = loaded)}
		/>
	</button>
</MessageQuote>
<MessageBubble tone="sent">
	<span class="wrap-anywhere whitespace-pre-wrap"
		>{message.photoContentReply}</span
	>
</MessageBubble>
