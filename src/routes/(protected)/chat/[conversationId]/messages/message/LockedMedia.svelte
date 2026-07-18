<script lang="ts">
	import { LockIcon } from "phosphor-svelte";

	let {
		class: className,
		size = "md",
		children,
	}: {
		class: import("svelte/elements").ClassValue;
		size?: "sm" | "md";
		children?: import("svelte").Snippet;
	} = $props();
</script>

<div
	class={[
		"size-full flex justify-center items-center bg-card-foreground/10 rounded-xl",
		className,
	]}
>
	<LockIcon
		weight="fill"
		class={[
			"aspect-square h-auto",
			{
				"w-1/8": size === "sm",
				"w-1/6": size === "md",
			},
		]}
		color="var(--color-neutral-600)"
	/>
	{@render children?.()}
</div>
