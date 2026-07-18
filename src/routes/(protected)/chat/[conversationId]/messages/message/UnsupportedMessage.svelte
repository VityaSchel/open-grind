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
	class="bg-card text-muted-foreground/30 w-full rounded-lg p-2 max-w-full text-center text-sm"
	bind:this={el}
>
	Unsupported message type: {type}
</div>
