<script lang="ts">
	import { page } from "$app/state";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

{#snippet tab(href: string, label: string)}
	{@const active = page.url.pathname === href}
	<Button
		{href}
		class={[
			toggleVariants({ variant: "default" }),
			"text-muted-foreground",
			{
				"hover:bg-muted-foreground/10": !active,
				"bg-muted-foreground/15 hover:bg-muted-foreground/20": active,
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
{@render children?.()}
