<script lang="ts">
	import { gaymojiFromImageHash } from "$lib/api/messaging/gaymoji";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import type { GaymojiMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: GaymojiMessage["body"] } = $props();

	const media = new MessageMediaState();
	const gaymoji = $derived(gaymojiFromImageHash(message.imageHash));
</script>

<div
	data-slot="gaymoji-message"
	class="relative size-30"
	{@attach media.attach}
>
	<MediaImage
		src={gaymoji.imageUrl}
		alt={gaymoji.label}
		fit="contain"
		skeleton
		class="block size-full rounded-lg"
	/>
	{@render media.adornments?.()}
</div>
