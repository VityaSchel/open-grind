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
		"relative w-fit max-w-100 shrink-0 overflow-visible rounded-xl bg-muted px-3 py-2 text-muted-foreground italic select-text",
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
