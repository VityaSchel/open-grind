<script lang="ts">
	import { untrack } from "svelte";

	import Field from "$lib/components/fields/Field.svelte";
	import { Input } from "$lib/components/ui/input";

	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		unit,
		placeholder,
	}: {
		label: string;
		value: number | null;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		placeholder?: string;
	} = $props();

	const allowsDecimal = $derived(step % 1 !== 0);
	let text = $state(value === null ? "" : String(value));
	let focused = $state(false);

	$effect(() => {
		const current = value;
		if (focused) return;
		untrack(() => {
			const formatted = current === null ? "" : String(current);
			if (text !== formatted) text = formatted;
		});
	});

	function sanitize(raw: string) {
		const cleaned = raw.replace(allowsDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
		if (!allowsDecimal) return cleaned;
		const firstDot = cleaned.indexOf(".");
		if (firstDot === -1) return cleaned;
		return (
			cleaned.slice(0, firstDot + 1) +
			cleaned.slice(firstDot + 1).replace(/\./g, "")
		);
	}

	function handleInput() {
		text = sanitize(text);
		if (text === "") {
			value = null;
			return;
		}
		const parsed = Number(text);
		if (!Number.isNaN(parsed)) value = parsed;
	}

	function commit() {
		focused = false;
		if (value === null) {
			text = "";
			return;
		}
		value = Math.min(max, Math.max(min, value));
		text = String(value);
	}
</script>

<Field {label}>
	<div class="relative">
		<Input
			type="text"
			inputmode={allowsDecimal ? "decimal" : "numeric"}
			bind:value={text}
			oninput={handleInput}
			onfocus={() => (focused = true)}
			onblur={commit}
			{placeholder}
			class={{ "pr-10": unit }}
		/>
		{#if unit}
			<span
				class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
			>
				{unit}
			</span>
		{/if}
	</div>
</Field>
