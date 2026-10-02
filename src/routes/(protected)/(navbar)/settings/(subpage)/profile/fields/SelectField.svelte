<script lang="ts" generics="T extends number">
	import { IsUsingKeyboard } from "bits-ui";
	import { CaretUpDownIcon, type IconComponentProps } from "phosphor-svelte";
	import type { Component } from "svelte";

	import Field from "$lib/components/fields/Field.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import type { Option } from "$lib/util/options";

	let {
		label,
		value = $bindable(),
		options,
		placeholder = "Not set",
		clearLabel = "Not set",
		nullable = true,
	}: {
		label: string;
		value: T | null;
		options: (Option<T> & { icon?: Component<IconComponentProps> })[];
		placeholder?: string;
		clearLabel?: string;
		nullable?: boolean;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value));
	const SelectedIcon = $derived(selected?.icon);
	const hasIcons = $derived(options.some((option) => option.icon));
	let menu = $state<HTMLElement | null>(null);
	const usingKeyboard = new IsUsingKeyboard();

	function revealSelected(opening: Event) {
		const checked = menu?.querySelector<HTMLElement>(
			'[role="menuitemradio"][aria-checked="true"]',
		);
		if (!checked) return;
		checked.scrollIntoView({ block: "center" });
		if (!usingKeyboard.current) return;
		opening.preventDefault();
		checked.focus({ preventScroll: true });
	}
</script>

<Field {label}>
	{#snippet picker({ labelId })}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						aria-labelledby="{labelId} {props.id}"
						variant="outline"
						class="w-full justify-between font-normal"
					>
						<span
							class={[
								"flex min-w-0 items-center gap-2",
								{ "text-muted-foreground": !selected },
							]}
						>
							{#if SelectedIcon}
								<SelectedIcon data-slot="select-field-icon" />
							{/if}
							{selected?.label ?? placeholder}
						</span>
						<CaretUpDownIcon class="size-4 shrink-0 opacity-60" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				bind:ref={menu}
				class="max-h-72 w-(--bits-dropdown-menu-anchor-width)"
				onOpenAutoFocus={revealSelected}
			>
				<DropdownMenu.RadioGroup
					bind:value={
						() => (value === null ? "" : String(value)),
						(next) =>
							(value =
								options.find(
									(option) => String(option.value) === next,
								)?.value ?? null)
					}
				>
					{#if nullable}
						<DropdownMenu.RadioItem
							value=""
							data-inset={hasIcons || undefined}
						>
							{clearLabel}
						</DropdownMenu.RadioItem>
					{/if}
					{#each options as option (option.value)}
						<DropdownMenu.RadioItem value={String(option.value)}>
							{#if option.icon}
								<option.icon data-slot="select-field-icon" />
							{/if}
							{option.label}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</Field>
