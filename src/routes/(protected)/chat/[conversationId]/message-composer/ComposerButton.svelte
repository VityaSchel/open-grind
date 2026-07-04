<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		icon,
		class: className,
		...props
	}: {
		icon: import("svelte").Snippet<
			[import("phosphor-svelte").IconComponentProps]
		>;
		class?: import("svelte/elements").ClassValue;
	} & import("svelte").ComponentProps<typeof Button> = $props();
</script>

<Button
	type="button"
	variant="ghost"
	size="icon"
	class={[
		"absolute bottom-0 h-9.5 w-fit cursor-pointer rounded-none px-2",
		className,
	]}
	{...props}
>
	{@render icon({
		color: "var(--muted-foreground)",
		class: "size-4.5",
	})}
</Button>
