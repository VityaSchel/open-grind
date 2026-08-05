<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";

	export const buttonGroupVariants = tv({
		base: "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 has-[>[data-variant=outline]]:*:data-[slot=input-group]:border-border has-[>[data-variant=outline]]:*:data-[slot=select-trigger]:border-border [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[>[data-variant=outline]]:[&>[data-slot=input-group]:has(:focus-visible)]:border-ring has-[>[data-variant=outline]]:[&>[data-slot=select-trigger]:focus-visible]:border-ring has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-4xl [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[>[data-variant=outline]]:[&>input]:border-border has-[>[data-variant=outline]]:[&>input:focus-visible]:border-ring",
		variants: {
			orientation: {
				horizontal:
					"[&>[data-slot]]:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-4xl! [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
				vertical:
					"flex-col [&>[data-slot]]:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-4xl! [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
			},
		},
		defaultVariants: { orientation: "horizontal" },
	});

	export type ButtonGroupOrientation = VariantProps<
		typeof buttonGroupVariants
	>["orientation"];
</script>

<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { cn, type WithElementRef } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		orientation = "horizontal",
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		orientation?: ButtonGroupOrientation;
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="button-group"
	data-orientation={orientation}
	class={cn(buttonGroupVariants({ orientation }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
