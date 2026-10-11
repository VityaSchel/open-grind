<script lang="ts">
	import type { Component } from "svelte";

	import Field from "$lib/components/fields/Field.svelte";
	import { Input } from "$lib/components/ui/input";
	import { t } from "$lib/i18n";

	let {
		label,
		value = $bindable(),
		icon: Icon,
		maxLength = 64,
	}: {
		label: string;
		value: string | null;
		icon?: Component<{ class?: string }>;
		maxLength?: number;
	} = $props();
</script>

<Field {label} translateLabel={false}>
	{#snippet control({ id })}
		<div class="relative">
			{#if Icon}
				<span
					class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
				>
					<Icon class="size-4" />
				</span>
			{/if}
			<Input
				{id}
				bind:value={
					() => value ?? "",
					(newValue: string) =>
						(value =
							newValue.trim() === "" ? null : newValue.trim())
				}
				maxlength={maxLength}
				placeholder={t("settings.profile.socialPlaceholder")}
				autocapitalize="off"
				autocomplete="off"
				spellcheck={false}
				class={{ "pl-9": Icon }}
			/>
		</div>
	{/snippet}
</Field>
