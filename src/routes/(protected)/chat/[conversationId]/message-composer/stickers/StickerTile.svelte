<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";
	import type { ClassValue } from "svelte/elements";

	import SelectionOverlay from "#lib/components/shared/SelectionOverlay.svelte";

	let {
		label,
		translateLabel = true,
		selected,
		attach,
		onclick,
		class: className,
		children,
	}: {
		label: string;
		translateLabel?: boolean;
		selected: boolean;
		attach?: Attachment<HTMLElement>;
		onclick: () => void;
		class?: ClassValue;
		children: Snippet;
	} = $props();
</script>

<button
	{@attach attach}
	type="button"
	data-slot="sticker-tile"
	class={["relative cursor-pointer scroll-mt-18 rounded-lg", className]}
	aria-label={label}
	translate={translateLabel ? undefined : "no"}
	aria-pressed={selected}
	{onclick}
>
	{@render children()}
	{#if selected}
		<SelectionOverlay />
	{/if}
</button>
