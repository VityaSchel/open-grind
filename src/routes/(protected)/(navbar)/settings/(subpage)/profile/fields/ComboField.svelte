<script lang="ts" generics="T extends string | number">
	import XIcon from "phosphor-svelte/lib/XIcon";
	import { tick } from "svelte";

	import Field from "#lib/components/fields/Field.svelte";
	import * as Combobox from "#lib/components/ui/combobox/index.ts";
	import { formatInteger } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { softKeyboardVisibility } from "#lib/platform/native-insets.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import type { Option } from "#lib/util/options.ts";

	let {
		label,
		hint,
		values = $bindable(),
		options,
		resolveLabel,
		exclude,
		max,
		searchPlaceholder,
	}: {
		label: string;
		hint?: string;
		values: T[];
		options: Option<T>[];
		resolveLabel?: (id: T) => string | undefined;
		exclude?: (id: T) => T[];
		max?: number;
		searchPlaceholder: string;
	} = $props();

	const REMOVE_KEYS = new Set(["Delete", "Backspace"]);
	const CHIP_ACTIVATION_KEYS = new Set([...REMOVE_KEYS, "Enter"]);

	const chips = new RovingFocusState({
		keys: () => values,
		orientation: "horizontal",
		wrap: "loop",
	});

	let searchValue = $state("");
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let removalAnnouncement = $state("");

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
		const params = { count: values.length, max: formatInteger(max) };
		return atMax
			? t("settings.profile.combo.selectedAtMax", params)
			: t("settings.profile.combo.selected", params);
	});

	async function announceRemoval(id: T) {
		removalAnnouncement = "";
		await tick();
		removalAnnouncement = t("settings.profile.combo.a11y.removed", {
			label: labelFor(id),
		});
	}

	function remove({ id, byKeyboard }: { id: T; byKeyboard: boolean }) {
		const index = values.indexOf(id);
		void announceRemoval(id);
		values = values.filter((value) => value !== id);
		if (!byKeyboard) return;
		const neighbor = values[index] ?? values[index - 1];
		if (neighbor === undefined) inputEl?.focus();
		else void chips.focus({ key: neighbor });
	}

	function removeOnKey({ event, id }: { event: KeyboardEvent; id: T }) {
		if (event.repeat) {
			if (CHIP_ACTIVATION_KEYS.has(event.key)) event.preventDefault();
			return;
		}
		if (!REMOVE_KEYS.has(event.key)) return;
		event.preventDefault();
		remove({ id, byKeyboard: true });
	}

	function focusLastChipFromEmptyInput(event: KeyboardEvent) {
		const last = values.at(-1);
		if (
			event.key !== "Backspace" ||
			event.repeat ||
			inputEl?.value ||
			last === undefined ||
			softKeyboardVisibility() === true
		)
			return;
		event.preventDefault();
		void chips.focus({ key: last });
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
		removalAnnouncement = "";
	}
</script>

<Field {label} hint={effectiveHint}>
	{#snippet picker({ labelId })}
		{#if selectedChips.length}
			<div
				role="toolbar"
				aria-labelledby={labelId}
				class="flex flex-wrap gap-1.5"
				{@attach chips.container}
			>
				{#each selectedChips as chip (chip.id)}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1.5 pl-3 text-sm text-secondary-foreground"
					>
						<span translate="no">{chip.label}</span>
						<button
							type="button"
							onclick={(event) =>
								remove({
									id: chip.id,
									byKeyboard: event.detail === 0,
								})}
							onkeydown={(event) =>
								removeOnKey({ event, id: chip.id })}
							aria-label={t(
								"settings.profile.combo.a11y.remove",
								{ label: chip.label },
							)}
							class="-my-1 grid size-5 place-items-center rounded-full transition-colors hover:bg-foreground/10"
							{@attach chips.item(chip.id)}
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
						newValue.flatMap(
							(value) => valueByString.get(value) ?? [],
						),
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
					oninput={(event) =>
						(searchValue = event.currentTarget.value)}
					onclick={() => (open = true)}
					onkeydown={focusLastChipFromEmptyInput}
					placeholder={searchPlaceholder}
					aria-labelledby={labelId}
				/>
				<Combobox.Trigger
					aria-label={t("settings.profile.combo.a11y.toggleList")}
				/>
				<span role="status" class="sr-only">{removalAnnouncement}</span>
			</div>

			<Combobox.Content aria-labelledby={labelId}>
				{#each filtered as option (option.value)}
					<Combobox.Item
						value={String(option.value)}
						disabled={isDisabled(option.value)}
						translate="no"
					>
						{option.label}
					</Combobox.Item>
				{:else}
					<Combobox.Empty>
						{t("settings.profile.combo.noMatches")}
					</Combobox.Empty>
				{/each}
			</Combobox.Content>
		</Combobox.Root>
	{/snippet}
</Field>
