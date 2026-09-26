<script lang="ts">
	import { Slider as SliderPrimitive } from "bits-ui";

	import { cn, type WithoutChildrenOrChild } from "$lib/util/utils.js";
	import { type SliderScale, TRACK_RESOLUTION } from "./scale";

	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = "horizontal",
		min,
		max,
		step,
		thumbLabels,
		thumbValueTexts,
		scale,
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SliderPrimitive.RootProps> & {
		thumbLabels: string[];
		thumbValueTexts?: string[];
		scale?: SliderScale;
	} = $props();

	type SliderValue = number | number[] | undefined;

	function mapValue({
		value,
		to,
	}: {
		value: SliderValue;
		to: (value: number) => number;
	}): SliderValue {
		if (value === undefined) return undefined;
		return Array.isArray(value) ? value.map(to) : to(value);
	}

	const scaledSteps = $derived(scale && [...scale.positions]);

	function scaledThumbAria(position: unknown) {
		if (!scale) return {};
		return {
			"aria-valuemin": scale.min,
			"aria-valuemax": scale.max,
			"aria-valuenow": scale.toValue(Number(position)),
		};
	}
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
	bind:ref
	bind:value={
		() =>
			(scale
				? mapValue({ value, to: scale.toPosition })
				: value) as never,
		(next: never) =>
			(value = scale
				? mapValue({ value: next, to: scale.toValue })
				: next)
	}
	data-slot="slider"
	data-vaul-no-drag
	{orientation}
	min={scale ? 0 : min}
	max={scale ? TRACK_RESOLUTION : max}
	step={scaledSteps ?? step}
	thumbPositioning="exact"
	class={cn(
		"relative flex touch-none items-center select-none in-data-vaul-drawer:touch-none! data-disabled:opacity-50 data-horizontal:mx-[calc(var(--slider-thumb-size)/2)] data-horizontal:h-4 data-horizontal:w-[calc(100%-var(--slider-thumb-size))] data-vertical:my-[calc(var(--slider-thumb-size)/2)] data-vertical:h-[calc(100%-var(--slider-thumb-size))] data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
		className,
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="slider-track"
			data-orientation={orientation}
			class={cn(
				"grow rounded-full bg-input/90 bg-muted data-horizontal:-mx-[calc(var(--slider-thumb-size)/2)] data-horizontal:h-2 data-horizontal:w-full data-vertical:-my-[calc(var(--slider-thumb-size)/2)] data-vertical:h-full data-vertical:w-2",
			)}
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class={cn(
					"absolute rounded-full bg-primary select-none data-horizontal:h-2 data-vertical:w-2",
					restProps.type === "single" &&
						"data-horizontal:-ms-[calc(var(--slider-thumb-size)/2)] data-vertical:-mb-[calc(var(--slider-thumb-size)/2)]",
				)}
			/>
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				data-slot="slider-thumb"
				index={thumb.index}
				aria-label={thumbLabels[thumb.index]}
				aria-valuetext={thumbValueTexts?.[thumb.index]}
				class="block h-4 w-(--slider-thumb-size) shrink-0 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-[color,box-shadow,background-color] select-none not-dark:bg-clip-padding hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-vertical:h-(--slider-thumb-size) data-vertical:w-4"
			>
				{#snippet child({ props })}
					<span
						{...props}
						{...scaledThumbAria(props["aria-valuenow"])}
					></span>
				{/snippet}
			</SliderPrimitive.Thumb>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
