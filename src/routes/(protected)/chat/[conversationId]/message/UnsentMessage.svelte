<script lang="ts">
	import { getMessageContext, getMessageMetaContext } from "./context";
	import MessageTail from "./MessageTail.svelte";

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div
	class={[
		"py-2 px-3 rounded-xl w-fit max-w-100 text-muted-foreground italic shrink-0 relative overflow-visible bg-muted select-text",
		{
			"pointer-coarse:select-none": !clone,
			"ms-3": !isOut && !clone,
			"rounded-es-none": lastInStack && !isOut,
			"me-3": isOut && !clone,
			"rounded-ee-none": lastInStack && isOut,
		},
	]}
	bind:this={el}
>
	{#if lastInStack}
		<MessageTail {isOut} class="fill-muted" />
	{/if}
	<span class="whitespace-pre-wrap">Message unsent</span>
	{@render adornments?.()}
</div>
