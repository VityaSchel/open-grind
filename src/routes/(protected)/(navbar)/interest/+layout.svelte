<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";
	import InterestPager from "./InterestPager.svelte";
	import { INTEREST_TABS } from "./tabs";

	let { data }: import("./$types").LayoutProps = $props();
</script>

{#snippet tab(href: string, label: string)}
	{@const active = page.url.pathname === href}
	<Button
		{href}
		onclick={(event: MouseEvent) => {
			if (
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			)
				return;
			event.preventDefault();
			void goto(href, { replaceState: true, noScroll: true });
		}}
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
	{#each INTEREST_TABS as { href, label } (href)}
		{@render tab(href, label)}
	{/each}
</ProgressiveBlur>
<InterestPager ourProfileId={data.ourProfileId} />
