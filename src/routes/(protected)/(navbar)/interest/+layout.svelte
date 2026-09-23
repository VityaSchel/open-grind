<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";
	import { isPlainClick } from "$lib/util/plain-click";
	import { topChrome } from "$lib/util/screen-chrome.svelte";
	import InterestPager from "./InterestPager.svelte";
	import { INTEREST_TABS, interestTabIndex } from "./tabs";

	let { data }: import("./$types").LayoutProps = $props();

	const routedTab = $derived(interestTabIndex(page.url.pathname));
</script>

{#snippet tab(href: string, label: string)}
	{@const active = page.url.pathname === href}
	<Button
		{href}
		onclick={(event: MouseEvent) => {
			if (!isPlainClick(event)) return;
			event.preventDefault();
			void goto(href, { replaceState: true, noScroll: true });
		}}
		class={[
			toggleVariants({ variant: "default" }),
			"text-muted-foreground",
			{ "hover:bg-muted-foreground/10": !active },
		]}
	>
		{label}
	</Button>
{/snippet}
<div class="interest">
	<ProgressiveBlur
		direction="topToBottom"
		tag="nav"
		data-fixed-header
		class="fixed top-0 left-0 z-10 w-full px-4 pt-fixed-header pb-2"
		bgClass="bg-linear-to-b from-background to-transparent"
		contentClass="flex items-center w-full *:flex-1 max-w-120 mx-auto"
		{@attach topChrome}
	>
		<span
			data-slot="interest-tab-chip"
			aria-hidden="true"
			class="tab-chip pointer-events-none absolute inset-y-0 left-0 -z-10 rounded-3xl bg-muted-foreground/15"
			style:width="{100 / INTEREST_TABS.length}%"
			style:--routed-tab={routedTab}
			style:--last-tab={INTEREST_TABS.length - 1}
		></span>
		{#each INTEREST_TABS as { href, label } (href)}
			{@render tab(href, label)}
		{/each}
	</ProgressiveBlur>
	<InterestPager ourProfileId={data.ourProfileId} />
</div>

<style>
	.interest {
		timeline-scope: --interest-pager;
	}
	.tab-chip {
		translate: calc(var(--routed-tab) * 100%);
	}
	@supports (timeline-scope: none) {
		.tab-chip {
			animation: follow-pager linear both;
			animation-timeline: --interest-pager;
		}
	}
	@keyframes follow-pager {
		from {
			translate: 0;
		}
		to {
			translate: calc(var(--last-tab) * 100%);
		}
	}
</style>
