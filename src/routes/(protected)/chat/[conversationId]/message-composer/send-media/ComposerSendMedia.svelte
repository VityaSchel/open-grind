<script lang="ts">
	import { receiveKeyboardMedia } from "$lib/platform/keyboard-media.svelte";
	import { receiveMedia } from "$lib/platform/media-intake.svelte";
	import type { PickedMedia } from "$lib/platform/media-picker";
	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import { getSendMediaOffer } from "./send-media-offer.svelte";

	const composer = getMessageComposerContext();
	const offer = getSendMediaOffer();

	offer.lend(composer);

	function receive(media: PickedMedia[]) {
		void offer.offer({ conversationId: composer().conversationId, media });
	}

	receiveMedia(() =>
		composer().disabled
			? null
			: { label: "Drop to send", videos: true, receive },
	);

	receiveKeyboardMedia(() =>
		composer().disabled ? null : (media) => receive([media]),
	);
</script>
