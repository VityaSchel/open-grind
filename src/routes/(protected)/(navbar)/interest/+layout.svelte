<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { Tabs } from "bits-ui";
	import { onDestroy } from "svelte";

	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { toggleVariants } from "#lib/components/ui/toggle/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { isPlainClick } from "#lib/util/plain-click.ts";
	import { topChrome } from "#lib/util/screen-chrome.svelte.ts";
	import { cn } from "#lib/util/utils.ts";
	import InterestPager from "./InterestPager.svelte";
	import {
		INTEREST_TABS,
		interestTabIndex,
		tabChipDetachesAtRest,
	} from "./tabs";

	let { data }: import("./$types").LayoutProps = $props();

	const chipDetachesAtRest = tabChipDetachesAtRest();
	const uid = $props.id();
	const tabs = INTEREST_TABS.map(({ href, label }, index) => ({
		href,
		label,
		ids: { tab: `${uid}-tab-${index}`, panel: `${uid}-panel-${index}` },
	}));

	let pagerUnsettled = $state(false);
	let restingTab = $state<number>();
	let settling = 0;

	const routedTab = $derived(interestTabIndex(page.url.pathname));
	const routed = $derived(INTEREST_TABS[routedTab] ?? INTEREST_TABS[0]);
	const chipFollows = $derived(
		!chipDetachesAtRest ||
			pagerUnsettled ||
			(restingTab !== undefined && restingTab !== routedTab),
	);

	function unsettle() {
		cancelAnimationFrame(settling);
		pagerUnsettled = true;
	}

	function settle(tab: number) {
		restingTab = tab;
		cancelAnimationFrame(settling);
		settling = requestAnimationFrame(() => {
			settling = requestAnimationFrame(() => {
				pagerUnsettled = false;
			});
		});
	}

	function selectTab(href: string) {
		void goto(href, { replace: true, reset: false });
	}

	onDestroy(() => cancelAnimationFrame(settling));
</script>

<PageTitle page={t(routed.label)} />
<Tabs.Root activationMode="manual" bind:value={() => routed.href, selectTab}>
	{#snippet child({ props })}
		<div {...props} class="interest">
			<ProgressiveBlur
				direction="topToBottom"
				tag="nav"
				aria-label={t("common.sections.interest")}
				data-fixed-header
				class="fixed top-0 left-0 z-10 w-full pt-fixed-header px-safe-4 pb-2"
				bgClass="bg-linear-to-b from-background to-transparent"
				contentClass="w-full max-w-120 mx-auto"
				{@attach topChrome}
			>
				<Tabs.List class="flex w-full items-center *:flex-1">
					<span
						data-slot="interest-tab-chip"
						aria-hidden="true"
						class={[
							"tab-chip pointer-events-none absolute inset-y-0 left-0 -z-10 rounded-3xl bg-muted-foreground/15",
							{ "tab-chip-following": chipFollows },
						]}
						style:width="{100 / INTEREST_TABS.length}%"
						style:--routed-tab={routedTab}
						style:--last-tab={INTEREST_TABS.length - 1}
					></span>
					{#each tabs as { href, label, ids } (href)}
						<Tabs.Trigger value={href} id={ids.tab}>
							{#snippet child({ props: tabProps })}
								<Button
									{...tabProps}
									{href}
									aria-controls={ids.panel}
									onclick={(event: MouseEvent) => {
										if (!isPlainClick(event)) return;
										event.preventDefault();
										selectTab(href);
									}}
									class={cn(
										toggleVariants({ variant: "default" }),
										"text-muted-foreground hover:bg-transparent",
									)}
								>
									{t(label)}
								</Button>
							{/snippet}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</ProgressiveBlur>
			<InterestPager
				ourProfileId={data.ourProfileId}
				tabIds={tabs.map(({ ids }) => ids)}
				onUnsettle={unsettle}
				onSettle={settle}
			/>
		</div>
	{/snippet}
</Tabs.Root>

<style>
	.interest {
		timeline-scope: --interest-pager;
	}
	.tab-chip {
		translate: calc(var(--routed-tab) * 100%);
	}
	@supports (timeline-scope: none) {
		.tab-chip-following {
			animation: follow-pager linear both;
			animation-timeline: --interest-pager;
		}
	}
	@supports not (timeline-scope: none) {
		@media (prefers-reduced-motion: no-preference) {
			.tab-chip {
				transition: translate 300ms ease-in-out;
			}
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
