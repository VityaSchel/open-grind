<script lang="ts">
	import { ArrowBendUpLeftIcon, XIcon } from "phosphor-svelte";
	import { expoOut } from "svelte/easing";
	import { slide } from "svelte/transition";

	import { Button } from "$lib/components/ui/button";
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

<div
	class="flex items-center gap-2 rounded-xl border border-border bg-popover py-1.5 pr-1.5 pl-2.5"
	transition:slide={{ duration: 200, easing: expoOut }}
>
	<ArrowBendUpLeftIcon class="shrink-0 text-muted-foreground" size={16} />
	<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
		{label}
	</span>
	<Button
		variant="ghost"
		size="icon-xs"
		class="rounded-full text-muted-foreground"
		aria-label="Cancel reply"
		onclick={onCancel}
	>
		<XIcon />
	</Button>
</div>
