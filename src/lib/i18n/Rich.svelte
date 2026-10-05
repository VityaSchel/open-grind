<script lang="ts" generics="K extends RichKey">
	import type { Snippet } from "svelte";

	import {
		type KeyArgs,
		type RichKey,
		richParts,
		type RichProps,
	} from "$lib/i18n";
	import type { RichMessages } from "$lib/i18n/generated";

	let { key, params, ...rest }: RichProps<K> = $props();

	const snippets = $derived(
		new Map(Object.entries<Snippet<[text: string]>>(rest)),
	);
	const parts = $derived(
		richParts(key, ...([params] as KeyArgs<RichMessages[K]>)),
	);
</script>

{#each parts as part, index (index)}
	{@const render =
		part.tag === undefined ? undefined : snippets.get(part.tag)}
	{#if render}{@render render(part.text)}{:else}{part.text}{/if}
{/each}
