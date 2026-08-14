<script lang="ts">
	import { messageRef } from "./context";

	let { type }: { type: string } = $props();

	const ref = messageRef();
</script>

<div
	class="w-full max-w-full rounded-lg bg-card p-2 text-center text-sm text-muted-foreground/30"
	{@attach ref}
>
	Unsupported message type: {type}
</div>
