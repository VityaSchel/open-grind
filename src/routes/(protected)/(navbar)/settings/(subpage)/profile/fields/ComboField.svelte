<script lang="ts" generics="T extends string | number">
	import { Combobox } from "bits-ui";
	import { CaretUpDownIcon, CheckIcon, XIcon } from "phosphor-svelte";

	import type { Option } from "../options";
	import Field from "./Field.svelte";

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
	let keyboardNav = $state(false);

	const navKeys = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];

	const filtered = $derived(
		searchValue.trim() === ""
			? options
			: options.filter((option) =>
					option.label.toLowerCase().includes(searchValue.trim().toLowerCase()),
				),
	);

	const optionLabels = $derived(
		new Map(options.map((option) => [option.value, option.label])),
	);

	const valueByString = $derived(
		new Map<string, T>(
			[...options.map((option) => option.value), ...values].map((value) => [
				String(value),
				value,
			]),
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

	function remove(id: T) {
		values = values.filter((value) => value !== id);
	}

	function applySelection(newValue: T[]) {
		const previous = new Set(values);
		const added = newValue.filter((id) => !previous.has(id));
		let result = newValue;
		for (const id of added) {
			const excluded = exclude?.(id);
			if (excluded?.length) {
				const excludedSet = new Set(excluded);
				result = result.filter(
					(value) => value === id || !excludedSet.has(value),
				);
			}
		}
		if (max !== undefined && added.length && result.length > max) return;
		values = result;
	}

	const inputClass =
		"bg-input/50 focus-visible:border-ring focus-visible:ring-ring/30 h-9 w-full rounded-3xl border border-transparent pl-3 pr-9 py-1 text-base transition-[color,box-shadow,background-color] focus-visible:ring-3 md:text-sm placeholder:text-muted-foreground min-w-0 outline-none";
</script>

<Field {label} {hint}>
	{#if selectedChips.length}
		<div class="flex flex-wrap gap-1.5">
			{#each selectedChips as chip (chip.id)}
				<span
					class="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm"
				>
					{chip.label}
					<button
						type="button"
						onclick={() => remove(chip.id)}
						aria-label="Remove {chip.label}"
						class="hover:bg-foreground/10 -my-1 grid size-5 place-items-center rounded-full transition-colors"
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
			if (!isOpen) {
				searchValue = "";
				keyboardNav = false;
			}
		}}
	>
		<div class="relative">
			<Combobox.Input
				oninput={(event) => (searchValue = event.currentTarget.value)}
				onkeydown={(event) => {
					if (navKeys.includes(event.key)) keyboardNav = true;
				}}
				placeholder={searchPlaceholder}
				class={inputClass}
				aria-label={label}
			/>
			<Combobox.Trigger
				class="text-muted-foreground absolute inset-y-0 right-0 grid w-9 place-items-center"
				aria-label="Toggle list"
			>
				<CaretUpDownIcon class="size-4 opacity-60" />
			</Combobox.Trigger>
		</div>

		<Combobox.Portal>
			<Combobox.Content
				sideOffset={4}
				data-kb-nav={keyboardNav ? "" : undefined}
				onpointerdown={() => (keyboardNav = false)}
				onpointermove={() => (keyboardNav = false)}
				class="bg-popover text-popover-foreground ring-foreground/5 dark:ring-foreground/10 z-50 max-h-72 w-(--bits-floating-anchor-width) overflow-y-auto rounded-xl p-1.5 shadow-lg ring-1 outline-none"
			>
				<Combobox.Viewport>
					{#each filtered as option (option.value)}
						<Combobox.Item
							value={String(option.value)}
							label={option.label}
							class="can-hover:data-highlighted:bg-accent can-hover:data-highlighted:text-accent-foreground in-data-kb-nav:data-highlighted:bg-accent in-data-kb-nav:data-highlighted:text-accent-foreground flex cursor-default items-center justify-between gap-2 rounded-2xl py-2 pl-3 pr-2 text-sm font-medium outline-hidden select-none"
						>
							{#snippet children({ selected: isSelected })}
								<span>{option.label}</span>
								{#if isSelected}
									<CheckIcon class="size-4 shrink-0" />
								{/if}
							{/snippet}
						</Combobox.Item>
					{:else}
						<div class="text-muted-foreground px-3 py-2 text-sm">
							No matches
						</div>
					{/each}
				</Combobox.Viewport>
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
</Field>
