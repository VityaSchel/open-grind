<script lang="ts">
	import { ArrowBendUpLeftIcon, XIcon } from "phosphor-svelte";

	import {
		previewFromMessage,
		quoteLabel,
	} from "$lib/model/messaging/message-preview";
	import type { ApiResponseMessage } from "$lib/model/messaging/messages";

	let {
		message,
		onCancel,
	}: { message: ApiResponseMessage; onCancel?: () => void } = $props();

	const label = $derived(quoteLabel(previewFromMessage(message)));
</script>

<div class="flex items-center gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-2.5">
	<ArrowBendUpLeftIcon class="shrink-0 text-muted-foreground" size={16} />
	<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
		{label}
	</span>
	<button
		type="button"
		aria-label="Cancel reply"
		class="shrink-0 rounded-full p-1 text-muted-foreground active:bg-foreground/10"
		onclick={onCancel}
	>
		<XIcon size={14} />
	</button>
</div>
