<script lang="ts">
	import { page } from "$app/state";

	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

{#snippet tab(href: string, label: string)}
	<Button
		{href}
		class={[
			toggleVariants({ variant: "default" }),
			"text-muted-foreground hover:bg-foreground/10",
			{
				"bg-popover/50": page.url.pathname === href,
			},
		]}
	>
		{label}
	</Button>
{/snippet}
<ProgressiveBlur
	direction="topToBottom"
	tag="nav"
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full px-4 pt-fixed-header pb-2"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center w-full *:flex-1 max-w-120 mx-auto"
>
	{@render tab("/interest/views", "Views")}
	{@render tab("/interest/taps", "Taps")}
</ProgressiveBlur>
<div class="flex w-full flex-1 p-4">
	<main
		class="mx-auto flex min-h-[calc(var(--screen-scroll)+1.5rem)] w-full flex-1 flex-col gap-3"
	>
		<div class="h-10"></div>
		{@render children?.()}
	</main>
</div>
