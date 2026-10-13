<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		icon,
		class: className,
		ref = $bindable(null),
		...props
	}: {
		icon: import("svelte").Snippet<
			[import("phosphor-svelte").IconComponentProps]
		>;
		class?: import("svelte/elements").ClassValue;
	} & import("svelte").ComponentProps<typeof Button> = $props();
</script>

<Button
	bind:ref
	type="button"
	variant="ghost"
	size="icon"
	class={[
		"absolute bottom-0 h-11 w-fit cursor-pointer rounded-none px-2",
		className,
	]}
	{...props}
>
	{@render icon({ color: "var(--muted-foreground)", class: "size-5" })}
</Button>
