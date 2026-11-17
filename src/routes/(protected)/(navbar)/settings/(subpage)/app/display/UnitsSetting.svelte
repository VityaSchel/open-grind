<script lang="ts">
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		preferencesSnapshot,
		setPreferences,
	} from "#lib/app-data/preferences.svelte.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import * as RadioGroup from "#lib/components/ui/radio-group/index.ts";
	import { toggleVariants } from "#lib/components/ui/toggle/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { UnitSystem } from "#lib/util/units.ts";

	const optionClass = cn(
		toggleVariants({ variant: "outline" }),
		"flex-1 shrink-0 justify-center rounded-none border-l-0 px-3 shadow-none first:rounded-l-3xl first:border-l last:rounded-r-3xl focus-visible:z-10 data-[state=checked]:bg-popover-foreground data-[state=checked]:text-popover",
	);

	let pending = $state<UnitSystem | null>(null);
	const value = $derived(pending ?? preferencesSnapshot().units);
</script>

<Item.Root variant="outline" class="gap-3 p-4">
	<Item.Content class="gap-1">
		<Item.Title>{t("settings.app.units.title")}</Item.Title>
		<Item.Description>
			{t("settings.app.units.description")}
		</Item.Description>
	</Item.Content>
	<RadioGroup.Root
		orientation="horizontal"
		loop
		aria-label={t("settings.app.units.title")}
		class="flex-row items-center rounded-3xl"
		bind:value={
			() => value,
			(next: string) => {
				const units = next as UnitSystem;
				pending = units;
				setPreferences({ units }).catch((error) => {
					pending = null;
					showErrorToast({
						label: t("settings.setting.errors.saveFailed"),
						error,
					});
				});
			}
		}
	>
		<RadioGroup.Item value="metric" class={optionClass}>
			{t("settings.app.units.metric")}
		</RadioGroup.Item>
		<RadioGroup.Item value="imperial" class={optionClass}>
			{t("settings.app.units.imperial")}
		</RadioGroup.Item>
	</RadioGroup.Root>
</Item.Root>
