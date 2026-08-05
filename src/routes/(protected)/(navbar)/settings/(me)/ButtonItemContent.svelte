<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		children,
		variant = "outline",
		...props
	}: import("svelte").ComponentProps<typeof Button> = $props();
</script>

<Button
	{variant}
	{...props}
	class={[
		"h-auto cursor-pointer truncate",
		props.class,
		"justify-start dark:hover:bg-muted",
		{ "border-white/10 dark:hover:border-white/20": variant === "outline" },
	]}
>
	{@render children?.()}
</Button>
