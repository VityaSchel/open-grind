<script lang="ts">
	import SpinnerIcon from "phosphor-svelte/lib/SpinnerIcon";
	import type { SVGAttributes } from "svelte/elements";

	import { t } from "$lib/i18n";
	import { cn } from "$lib/util/utils.js";

	let {
		class: className,
		role = "status",
		// we add name, color, and stroke for compatibility with different icon libraries props
		name,
		color,
		stroke,
		"aria-label": ariaLabel,
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();
</script>

<SpinnerIcon
	{role}
	name={name === null ? undefined : name}
	color={color === null ? undefined : color}
	stroke={stroke === null ? undefined : stroke}
	aria-label={ariaLabel === undefined
		? t("common.spinner.a11y.loading")
		: ariaLabel}
	aria-hidden={false}
	class={cn("size-4 animate-spin", className)}
	{...restProps}
/>
