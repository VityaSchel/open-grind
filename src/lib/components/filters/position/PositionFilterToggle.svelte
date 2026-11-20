<script lang="ts">
	import XIcon from "phosphor-svelte/lib/XIcon";
	import type z from "zod";

	import {
		sexualPositionIcons,
		sexualPositionOrder,
	} from "#lib/components/profile/sexual-position-icons.ts";
	import * as ToggleGroup from "#lib/components/ui/toggle-group/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		FilterPosition,
		filterPositionSchema,
	} from "#lib/model/browse/grid/filters.ts";
	import { sexualPositions } from "#lib/model/users/profiles.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";

	let {
		value = $bindable(),
	}: { value: z.infer<typeof filterPositionSchema> } = $props();

	const chips = new RovingFocusState({
		keys: () => [...sexualPositionOrder, FilterPosition.NotSpecified],
		orientation: "horizontal",
		wrap: "loop",
	});
</script>

<ToggleGroup.Root
	type="multiple"
	variant="outline"
	spacing={2}
	class="w-full flex-wrap gap-1"
	rovingFocus={false}
	aria-label={t("common.filters.position.label")}
	{@attach chips.container}
	bind:value={
		() => value.map(String),
		(v: string[]) => (value = filterPositionSchema.parse(v.map(Number)))
	}
>
	{#each sexualPositionOrder as position (position)}
		{@const Icon = sexualPositionIcons[position]}
		<ToggleGroup.Item
			value={position.toString()}
			{@attach chips.item(position)}
		>
			<Icon />
			{sexualPositions[position]}
		</ToggleGroup.Item>
	{/each}
	<ToggleGroup.Item
		value={FilterPosition.NotSpecified.toString()}
		{@attach chips.item(FilterPosition.NotSpecified)}
	>
		<XIcon />
		{t("common.filters.notSpecified")}
	</ToggleGroup.Item>
</ToggleGroup.Root>
