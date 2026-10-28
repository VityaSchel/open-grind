<script lang="ts">
	import type { HTMLInputTypeAttribute } from "svelte/elements";

	import { Input } from "#lib/components/ui/input/index.ts";
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

<Field {label} hint="{value.length}/{maxLength}">
	{#snippet control({ id })}
		<Input {id} bind:value {placeholder} {type} maxlength={maxLength} />
	{/snippet}
</Field>
