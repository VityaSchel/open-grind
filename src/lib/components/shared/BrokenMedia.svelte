<script lang="ts">
	import { ImageBrokenIcon } from "phosphor-svelte";

	let {
		class: className,
		tone = "muted",
		size = "sm",
		aspectRatio,
		label,
	}: {
		class?: import("svelte/elements").ClassValue;
		tone?: "muted" | "photo";
		size?: "xs" | "sm" | "md" | "lg" | "xl";
		aspectRatio?: string;
		label?: string;
	} = $props();
</script>

<div
	data-slot="broken-media"
	role={label === undefined ? undefined : "img"}
	aria-label={label}
	class={[
		"flex items-center justify-center",
		{
			"bg-card-foreground/20": tone === "muted",
			"bg-neutral-700": tone !== "muted",
		},
		className,
	]}
	style:aspect-ratio={aspectRatio}
>
	<ImageBrokenIcon
		weight="fill"
		color={tone === "muted"
			? "var(--color-neutral-600)"
			: "var(--color-stone-400)"}
		class={[
			"aspect-square h-auto",
			{
				"w-1/8": size === "xs",
				"w-1/6": size === "sm",
				"w-1/2": size === "md",
				"w-3/5": size === "lg",
				"w-3/4": size === "xl",
			},
		]}
	/>
</div>
