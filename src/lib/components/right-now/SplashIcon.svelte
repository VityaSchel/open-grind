<script lang="ts">
	import type { IconComponentProps, IconWeight } from "phosphor-svelte";

	let {
		weight = "regular",
		color = "currentColor",
		size = "1em",
		mirrored = false,
		children,
		...attributes
	}: IconComponentProps = $props();

	const CENTERLINE =
		"M201.59,28.96C167.35,21.23 100,46 100,46C100,46 150.17,97.31 184.41,105.04A39,39,0,0,0,231.04,75.59A39,39,0,0,0,201.59,28.96ZM102,185C102,149.9 63,90 63,90C63,90 24,149.9 24,185A39,39,0,0,0,63,224A39,39,0,0,0,102,185ZM208.29,176.19C192.26,157.93 145,145 145,145C145,145 151.68,193.55 167.71,211.81A27,27,0,0,0,205.81,214.29A27,27,0,0,0,208.29,176.19Z";
	const SILHOUETTE =
		"M97.24,38.49C97.37,38.44 108.32,34.42 123.73,30.08C146.19,23.75 180.53,16 203.35,21.16A47,47,0,0,1,238.85,77.35A47,47,0,0,1,182.65,112.84C167.17,109.35 149.77,98.36 135.09,87.31C112.73,70.47 94.39,51.7 94.28,51.59A8,8,0,0,1,97.24,38.49ZM69.7,85.63C69.78,85.75 76.12,95.5 83.75,109.5C94.88,129.93 110,161.6 110,185A47,47,0,0,1,63,232A47,47,0,0,1,16,185C16,169.13 22.89,149.79 30.44,133.1C41.94,107.67 56.21,85.76 56.3,85.63A8,8,0,0,1,69.7,85.63ZM147.11,137.28C147.25,137.32 155,139.44 165.38,143.2C180.33,148.6 203.13,158.18 214.3,170.91A35,35,0,0,1,211.09,220.31A35,35,0,0,1,161.7,217.09C154.07,208.4 148.76,194.81 145.13,182.71C139.55,164.15 137.1,146.24 137.07,146.09A8,8,0,0,1,147.11,137.28Z";
	const STROKE_WIDTHS: Record<Exclude<IconWeight, "fill">, number> = {
		thin: 8,
		light: 12,
		regular: 16,
		bold: 24,
		duotone: 16,
	};
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	width={size}
	height={size}
	viewBox="0 0 256 256"
	transform={mirrored ? "scale(-1, 1)" : undefined}
	{...attributes}
>
	{@render children?.()}
	{#if weight === "fill"}
		<path d={SILHOUETTE} fill={color} />
	{:else}
		{#if weight === "duotone"}
			<path d={CENTERLINE} fill={color} opacity="0.2" />
		{/if}
		<path
			d={CENTERLINE}
			fill="none"
			stroke={color}
			stroke-width={STROKE_WIDTHS[weight]}
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
</svg>
