<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { getTapsState } from "#lib/interest/taps-state.svelte.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";

	let { ourProfileId, active }: { ourProfileId: number; active: boolean } =
		$props();

	const taps = untrack(() => getTapsState(ourProfileId));

	const rows = new RovingFocusState({
		keys: () => taps.taps.map(({ profileId }) => profileId),
		orientation: "vertical",
		cells: (item) => [
			...item.querySelectorAll<HTMLElement>(
				'[data-slot="profile-item-link"]',
			),
		],
		consumeAtEdge: ["left", "right"],
		openerScope: "/interest/taps",
	});

	$effect(() => {
		if (active) return taps.attachView();
	});

	$effect(() => {
		if (active && taps.hasUnseen) taps.markViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce({ container: () => container, state: taps });
</script>

<div class="screen-nav-host">
	{#if !taps.loading && (taps.taps.length > 0 || !taps.error)}
		<DataRefreshControl
			{container}
			updating={taps.refreshing}
			failed={taps.refreshFailed}
			position="top"
			onrefresh={() => void taps.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="taps-scroller"
		class="pull-scroller scroll-pt-header-clear-16 scroll-pb-nav-clear overscroll-x-auto"
		onscroll={() => (taps.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="mx-auto min-h-overscrollable flex w-full max-w-120 flex-col gap-1 px-4 pt-header-clear-16 pb-nav-clear"
		>
			{#if taps.loading}
				{#each Array(8)}
					<Skeleton class="h-24.5 w-full shrink-0" />
				{/each}
			{:else if taps.error && taps.taps.length === 0}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={taps.error}
						onRetry={() => taps.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				{#if taps.taps.length > 0}
					<div class="flex flex-col gap-1" {@attach rows.container}>
						{#each taps.taps as tap (tap.profileId)}
							<div {@attach rows.item(tap.profileId)}>
								<TapReceivedProfile {tap} />
							</div>
						{/each}
					</div>
				{:else}
					<EmptyTapsList />
				{/if}
				{#if taps.hasMore}
					<div
						class="h-0"
						use:observeIntersection={{
							handle: () => taps.loadMore(),
							rootMargin: "400px",
						}}
					></div>
				{/if}
			{/if}
		</div>
	</div>
	<ScrollToTopButton {container} class="bottom-nav-clear" />
</div>
