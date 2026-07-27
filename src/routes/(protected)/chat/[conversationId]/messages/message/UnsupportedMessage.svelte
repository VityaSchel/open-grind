<script lang="ts">
	import { getMessageMetaContext } from "./context";

	let { type }: { type: string } = $props();

	const { setRef } = $derived(getMessageMetaContext()());
	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div
	class="w-full max-w-full rounded-lg bg-card p-2 text-center text-sm text-muted-foreground/30"
	bind:this={el}
>
	Unsupported message type: {type}
</div>
