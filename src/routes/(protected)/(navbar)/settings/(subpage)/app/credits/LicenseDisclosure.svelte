<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import type { LoadedEntry } from "$lib/credits";

	let { entry }: { entry: LoadedEntry } = $props();

	let open = $state(false);

	const label = $derived(
		`${entry.shipped ?? entry.spdx} license${entry.versions.length ? ` · ${entry.versions.join(", ")}` : ""}`,
	);
</script>

{#if entry.texts.length}
	<details class="group/license min-w-0" bind:open>
		<summary
			class="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-0.5 pe-1 text-2xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 can-hover:hover:text-foreground"
		>
			<CaretRightIcon
				class="size-3 shrink-0 transition-transform group-open/license:rotate-90"
			/>
			<span class="min-w-0 truncate">{label}</span>
		</summary>
		{#if open}
			{#each entry.texts as text, index (index)}
				<pre
					class="mt-1 max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-muted-foreground select-text">{text}</pre>
			{/each}
		{/if}
	</details>
{:else}
	<span class="min-w-0 truncate ps-4 text-2xs text-muted-foreground">
		{label}
	</span>
{/if}
