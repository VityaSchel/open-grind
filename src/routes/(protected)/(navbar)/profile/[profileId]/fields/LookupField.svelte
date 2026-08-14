<script lang="ts" generics="K extends string | number">
	import type { IconWeight } from "phosphor-svelte";
	import type { Component } from "svelte";

	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let {
		icon: Icon,
		weight,
		label,
		value,
		options,
	}: {
		icon: Component<{ class?: string; weight?: IconWeight }>;
		weight?: IconWeight;
		label?: string;
		value: K | K[] | null | undefined;
		options: Record<K, string>;
	} = $props();

	const text = $derived.by(() => {
		if (value === null || value === undefined) return null;
		if (Array.isArray(value)) {
			if (value.length === 0) return null;
			return value.map((entry) => options[entry]).join(", ");
		}
		return options[value];
	});
</script>

{#if text !== null}
	<ProfileField>
		<Icon class="shrink-0" {weight} />
		{#if label === undefined}
			{text}
		{:else}
			<ProfileValueLabel {label}>{text}</ProfileValueLabel>
		{/if}
	</ProfileField>
{/if}
