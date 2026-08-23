<script lang="ts" generics="T extends string | number">
	import { XIcon } from "phosphor-svelte";
	import { tick } from "svelte";

	import Field from "$lib/components/fields/Field.svelte";
	import * as Combobox from "$lib/components/ui/combobox";
	import type { Option } from "$lib/util/options";

	let {
		label,
		hint,
		values = $bindable(),
		options,
		resolveLabel,
		exclude,
		max,
		searchPlaceholder = "Search...",
	}: {
		label: string;
		hint?: string;
		values: T[];
		options: Option<T>[];
		resolveLabel?: (id: T) => string | undefined;
		exclude?: (id: T) => T[];
		max?: number;
		searchPlaceholder?: string;
	} = $props();

	let searchValue = $state("");
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	const filtered = $derived(
		searchValue.trim() === ""
			? options
			: options.filter((option) =>
					option.label
						.toLowerCase()
						.includes(searchValue.trim().toLowerCase()),
				),
	);

	const optionLabels = $derived(
		new Map(options.map((option) => [option.value, option.label])),
	);

	const valueByString = $derived(
		new Map<string, T>(
			[...options.map((option) => option.value), ...values].map(
				(value) => [String(value), value],
			),
		),
	);

	function labelFor(id: T) {
		return (
			resolveLabel?.(id) ??
			optionLabels.get(id) ??
			(typeof id === "number" ? `#${id}` : id)
		);
	}

	const selectedChips = $derived(
		values.map((id) => ({ id, label: labelFor(id) })),
	);

	const selectedSet = $derived(new Set(values));
	const atMax = $derived(max !== undefined && values.length >= max);

	const excludedSet = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- filled inside this $derived, never mutated afterwards
		const result = new Set<T>();
		if (!exclude) return result;
		for (const value of values) {
			for (const id of exclude(value)) result.add(id);
		}
		return result;
	});

	function isDisabled(id: T) {
		if (selectedSet.has(id)) return false;
		return atMax || excludedSet.has(id);
	}

	const effectiveHint = $derived.by(() => {
		if (max === undefined) return hint;
		const count = `${values.length}/${max} selected`;
		return atMax ? `${count} · remove one to add another` : count;
	});

	function remove(id: T) {
		values = values.filter((value) => value !== id);
	}

	async function clearTypedQuery() {
		searchValue = "";
		await tick();
		if (!inputEl || inputEl.value === "") return;
		inputEl.value = "";
		inputEl.dispatchEvent(new Event("input", { bubbles: true }));
	}

	function applySelection(newValue: T[]) {
		if (max !== undefined && newValue.length > max) return;
		values = newValue;
		searchValue = "";
	}
</script>

<Field {label} hint={effectiveHint}>
	{#if selectedChips.length}
		<div class="flex flex-wrap gap-1.5">
			{#each selectedChips as chip (chip.id)}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-3 text-sm text-secondary-foreground"
				>
					{chip.label}
					<button
						type="button"
						onclick={() => remove(chip.id)}
						aria-label="Remove {chip.label}"
						class="-my-1 grid size-5 place-items-center rounded-full transition-colors hover:bg-foreground/10"
					>
						<XIcon class="size-3.5" />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<Combobox.Root
		type="multiple"
		bind:value={
			() => values.map(String),
			(newValue: string[]) =>
				applySelection(
					newValue.flatMap((value) => valueByString.get(value) ?? []),
				)
		}
		bind:open
		onOpenChange={(isOpen) => {
			if (!isOpen) void clearTypedQuery();
		}}
	>
		<div class="relative">
			<Combobox.Input
				bind:ref={inputEl}
				oninput={(event) => (searchValue = event.currentTarget.value)}
				onclick={() => (open = true)}
				placeholder={searchPlaceholder}
				aria-label={label}
			/>
			<Combobox.Trigger aria-label="Toggle list" />
		</div>

		<Combobox.Content>
			{#each filtered as option (option.value)}
				<Combobox.Item
					value={String(option.value)}
					disabled={isDisabled(option.value)}
				>
					{option.label}
				</Combobox.Item>
			{:else}
				<Combobox.Empty>No matches</Combobox.Empty>
			{/each}
		</Combobox.Content>
	</Combobox.Root>
</Field>
