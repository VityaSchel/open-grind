<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import Field from "./Field.svelte";

	let {
		label,
		value = $bindable(),
		maxLength,
		placeholder,
	}: {
		label: string;
		value: string;
		maxLength: number;
		placeholder?: string;
	} = $props();
</script>

<Field {label} hint="{value.length}/{maxLength}">
	<Input bind:value {placeholder} maxlength={maxLength} />
</Field>
