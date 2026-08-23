<script lang="ts">
	import Field from "$lib/components/fields/Field.svelte";
	import { Input } from "$lib/components/ui/input";

	let {
		label,
		value = $bindable(),
	}: { label: string; value: number | null } = $props();

	function toInput(ms: number | null) {
		if (ms === null) return "";
		const date = new Date(ms);
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${date.getFullYear()}-${month}-${day}`;
	}

	function fromInput(text: string) {
		if (text === "") return null;
		const [year, month, day] = text.split("-").map(Number);
		if (!year || !month || !day) return null;
		return new Date(year, month - 1, day).getTime();
	}

	const today = toInput(Date.now());
</script>

<Field {label}>
	<Input
		type="date"
		max={today}
		bind:value={
			() => toInput(value),
			(newValue: string) => (value = fromInput(newValue))
		}
	/>
</Field>
