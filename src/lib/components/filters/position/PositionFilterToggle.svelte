<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowDownRightIcon,
		ArrowsDownUpIcon,
		ArrowsLeftRightIcon,
		ArrowUpIcon,
		ArrowUpRightIcon,
		XIcon,
	} from "phosphor-svelte";
	import type z from "zod";

	import {
		FilterPosition,
		filterPositionSchema,
	} from "$lib/components/filters/filters";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let { value = $bindable() }: { value: z.infer<typeof filterPositionSchema> } =
		$props();
</script>

<ToggleGroup.Root
	type="multiple"
	variant="outline"
	spacing={2}
	class="flex-wrap w-full gap-1"
	bind:value={
		() => value.map(String),
		(v: string[]) => (value = filterPositionSchema.parse(v.map(Number)))
	}
>
	<ToggleGroup.Item value={FilterPosition.Top.toString()}>
		<ArrowUpIcon />
		Top
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.VersTop.toString()}>
		<ArrowUpRightIcon />
		Vers Top
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.Versatile.toString()}>
		<ArrowsDownUpIcon />
		Versatile
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.VersBottom.toString()}>
		<ArrowDownRightIcon />
		Vers Bottom
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.Bottom.toString()}>
		<ArrowDownIcon />
		Bottom
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.Side.toString()}>
		<ArrowsLeftRightIcon />
		Side
	</ToggleGroup.Item>
	<ToggleGroup.Item value={FilterPosition.NotSpecified.toString()}>
		<XIcon />
		Not specified
	</ToggleGroup.Item>
</ToggleGroup.Root>
