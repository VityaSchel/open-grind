<script lang="ts" generics="K extends RichKey">
	import type { Snippet } from "svelte";

	import {
		type RichArgs,
		type RichKey,
		richParts,
		type RichProps,
	} from "$lib/i18n";

	type Render = Snippet<[text?: string]>;

	let { key, ...names }: RichProps<K> = $props();

	const entries = $derived(Object.entries<unknown>(names));
	const snippets = $derived(
		new Map(
			entries.filter(
				(entry): entry is [string, Render] =>
					typeof entry[1] === "function",
			),
		),
	);
	const values = $derived(
		Object.fromEntries(
			entries.filter(
				(entry): entry is [string, string | number] =>
					typeof entry[1] === "string" ||
					typeof entry[1] === "number",
			),
		),
	);
	const parts = $derived(richParts(key, ...([values] as RichArgs<K>)));
</script>

{#each parts as part, index (index)}
	{@const render = part.kind === "text" ? undefined : snippets.get(part.name)}
	{#if render === undefined}{part.text}{:else if part.kind === "tag"}{@render render(
			part.text,
		)}{:else}{@render render()}{/if}
{/each}
