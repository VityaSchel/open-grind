<script lang="ts">
	import { CaretDownIcon } from "phosphor-svelte";
	import { onMount } from "svelte";
	import { expoOut } from "svelte/easing";
	import type { TransitionConfig } from "svelte/transition";

	import { instantWhenReducedMotion } from "$lib/util/reduced-motion";
	import FilterBoolean from "./FilterBoolean.svelte";

	let {
		checked = $bindable(),
		id,
		label,
		endLabel,
		children,
		contentClass,
		class: className,
	}: {
		checked: boolean;
		id: string;
		label: string;
		endLabel?: string;
		children?: import("svelte").Snippet;
		contentClass?: import("svelte/elements").ClassValue;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let expanded = $state(false);

	onMount(() => {
		if (checked) {
			expanded = true;
		}
	});

	const hide = instantWhenReducedMotion(
		(): TransitionConfig => ({
			duration: 400,
			css: (t: number) =>
				`grid-template-rows: minmax(0, ${t}fr); opacity: ${t}`,
			easing: expoOut,
		}),
	);
</script>

{#snippet endAdornment()}
	{endLabel}
{/snippet}
<div class={["flex min-w-0 shrink-0 flex-col", className]}>
	<FilterBoolean
		{id}
		endAdornment={endLabel !== undefined ? endAdornment : undefined}
		bind:checked={
			() => checked,
			(v: boolean) => {
				if (expanded && !checked) {
					expanded = false;
				} else {
					expanded = v;
					checked = v;
				}
			}
		}
	>
		{label}
		<CaretDownIcon
			class={[
				"transition-transform motion-reduce:transition-none",
				{ "-rotate-180": expanded },
			]}
		/>
	</FilterBoolean>
	{#if expanded}
		<div class="grid shrink-0 grid-cols-1 overflow-clip" transition:hide>
			<div class={["ps-6 pt-2", contentClass]}>
				{@render children?.()}
			</div>
		</div>
	{/if}
</div>
