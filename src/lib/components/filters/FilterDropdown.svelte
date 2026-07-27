<script lang="ts">
	import { CaretDownIcon } from "phosphor-svelte";
	import { onMount } from "svelte";
	import { expoOut } from "svelte/easing";
	import type { TransitionConfig } from "svelte/transition";

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

	const hide = (node: HTMLDivElement): TransitionConfig => {
		const height = node.scrollHeight;
		return {
			duration: 400,
			css: (t: number, u: number) =>
				`height: calc(${t} * ${height}px); opacity: ${t}; margin-top: calc(${u} * -8px)`,
			easing: expoOut,
		};
	};
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
			class={["transition-transform", { "-rotate-180": expanded }]}
		/>
	</FilterBoolean>
	{#if expanded}
		<div
			class={["shrink-0 overflow-clip ps-6 pt-2", contentClass]}
			transition:hide
		>
			{@render children?.()}
		</div>
	{/if}
</div>
