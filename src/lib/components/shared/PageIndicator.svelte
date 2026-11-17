<script lang="ts">
	import type { ClassValue } from "svelte/elements";

	import { cn } from "#lib/util/utils.ts";

	let {
		count,
		position,
		orientation = "vertical",
		tone = "overlay",
		shape = "dot",
		label,
		class: className,
	}: {
		count: number;
		position: number;
		orientation?: "vertical" | "horizontal";
		tone?: "overlay" | "accent";
		shape?: "dot" | "pill";
		label?: string;
		class?: ClassValue;
	} = $props();

	const GAP_PX = 4;
	const PADDING_PX = 8;
	const BULLET_SIZE_PX = 8;
	const BULLET_PITCH_PX = BULLET_SIZE_PX + GAP_PX;

	const vertical = $derived(orientation === "vertical");
	const pill = $derived(shape === "pill");
	const currentPage = $derived(Math.round(position));
	const progress = $derived(position % 1);
	const offset = $derived.by(() => {
		const page = Math.floor(position);
		const tip =
			Math.min(position > 0 ? page : position, count - 1) +
			(position < count - 1
				? Math.max(0, (progress - 0.5) * 2)
				: progress);
		return PADDING_PX + tip * BULLET_PITCH_PX;
	});
	const length = $derived(
		BULLET_SIZE_PX +
			(position > 0 && position < count - 1
				? Math.min(progress, 1 - progress) * 2 * BULLET_PITCH_PX
				: 0),
	);
</script>

<div
	data-slot="page-indicator"
	role={label === undefined ? undefined : "img"}
	aria-label={label}
	aria-hidden={label === undefined ? "true" : undefined}
	class={cn(
		"relative flex w-fit rounded-full",
		{
			"flex-col": vertical,
			"flex-row": !vertical,
			"bg-background/30 scrim backdrop-filter-(--bd-veil)":
				tone === "overlay",
		},
		className,
	)}
	style:gap="{GAP_PX}px"
	style:padding="{PADDING_PX}px"
>
	{#each { length: count }, index (index)}
		{@const current = pill && index === currentPage}
		<span
			data-current={current || undefined}
			class={[
				"block shrink-0 rounded-full",
				{
					"transition-[width,height,background-color] duration-200 motion-reduce:transition-none":
						pill,
					"w-5": current && !vertical,
					"w-2": !current || vertical,
					"h-5": current && vertical,
					"h-2": !current || !vertical,
					"bg-neutral-200/40": tone === "overlay" && !current,
					"bg-muted-foreground/40": tone === "accent" && !current,
					"bg-neutral-300": tone === "overlay" && current,
					"bg-primary": tone === "accent" && current,
				},
			]}
		></span>
	{/each}
	{#if !pill}
		<span
			data-slot="page-indicator-current"
			class={[
				"absolute block rounded-full",
				{
					"left-2 w-2": vertical,
					"top-2 h-2": !vertical,
					"bg-neutral-300": tone === "overlay",
					"bg-primary": tone === "accent",
				},
			]}
			style:top={vertical ? `${offset}px` : undefined}
			style:height={vertical ? `${length}px` : undefined}
			style:inset-inline-start={vertical ? undefined : `${offset}px`}
			style:width={vertical ? undefined : `${length}px`}
		></span>
	{/if}
</div>
