<script lang="ts">
	import { XIcon } from "phosphor-svelte";
	import type z from "zod";

	import {
		sexualPositionIcons,
		sexualPositionOrder,
	} from "$lib/components/profile/sexual-position-icons";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { t } from "$lib/i18n";
	import {
		FilterPosition,
		filterPositionSchema,
	} from "$lib/model/browse/grid/filters";
	import { sexualPositions } from "$lib/model/users/profiles";

	let {
		value = $bindable(),
	}: { value: z.infer<typeof filterPositionSchema> } = $props();
</script>

<ToggleGroup.Root
	type="multiple"
	variant="outline"
	spacing={2}
	class="w-full flex-wrap gap-1"
	bind:value={
		() => value.map(String),
		(v: string[]) => (value = filterPositionSchema.parse(v.map(Number)))
	}
>
	{#each sexualPositionOrder as position (position)}
		{@const Icon = sexualPositionIcons[position]}
		<ToggleGroup.Item value={position.toString()}>
			<Icon />
			{sexualPositions[position]}
		</ToggleGroup.Item>
	{/each}
	<ToggleGroup.Item value={FilterPosition.NotSpecified.toString()}>
		<XIcon />
		{t("common.filters.notSpecified")}
	</ToggleGroup.Item>
</ToggleGroup.Root>
