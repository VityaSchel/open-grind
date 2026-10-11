<script lang="ts">
	import Rich from "$lib/i18n/Rich.svelte";
	import { messageRef } from "./context";

	let { type }: { type: string } = $props();

	const ref = messageRef();
</script>

{#snippet wireType()}<span translate="no">{type}</span>{/snippet}

<div
	class="w-full max-w-full rounded-lg bg-card p-2 text-center text-sm text-muted-foreground/30"
	{@attach ref}
>
	<Rich key="chat.message.unsupported" type={wireType} />
</div>
