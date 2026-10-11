<script lang="ts">
	import type { HTMLInputTypeAttribute } from "svelte/elements";

	import { Input } from "$lib/components/ui/input";
	import { formatInteger } from "$lib/i18n/format";
	import Field from "./Field.svelte";

	let {
		label,
		value = $bindable(),
		maxLength,
		placeholder,
		type,
	}: {
		label: string;
		value: string;
		maxLength: number;
		placeholder?: string;
		type?: Exclude<HTMLInputTypeAttribute, "file">;
	} = $props();
</script>

<Field {label} hint="{formatInteger(value.length)}/{formatInteger(maxLength)}">
	{#snippet control({ id })}
		<Input {id} bind:value {placeholder} {type} maxlength={maxLength} />
	{/snippet}
</Field>
