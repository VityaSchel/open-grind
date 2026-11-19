<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { onDestroy, untrack } from "svelte";

	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { visibleBand } from "#lib/platform/reveal-keyboard-focus.ts";
	import { revealRowScrollTop } from "#lib/util/grid-window.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import { nearestScrollableAncestor } from "#lib/util/scroll.ts";
	import { virtualList } from "#lib/util/virtual-list.svelte.ts";
	import type { ProfileListToggle } from "./profile-list";
	import { ProfileListState } from "./profile-list-state.svelte";
	import ProfileListRow from "./ProfileListRow.svelte";

	let {
		loadIds,
		empty,
		scroll,
		eager = false,
		skeletons = 6,
		icon,
		emptyIcon,
		control,
		label,
		name,
		errorLabel,
		setOn,
	}: {
		loadIds: () => Promise<number[]>;
		empty: { title: string; description: string };
		scroll?: { scrollY: number };
		eager?: boolean;
		skeletons?: number;
		name?: string;
	} & ProfileListToggle = $props();

	const openerScope =
		untrack(() => scroll) === undefined ? undefined : page.url.pathname;

	const gridName = $derived(name ?? label);

	const list = new ProfileListState(() => ({
		loadIds,
		setOn,
		errorLabel,
		eager,
	}));

	let root: HTMLElement | null = $state(null);
	let rows: HTMLElement | null = $state(null);
	let emptyState: HTMLElement | null = $state(null);

	const view = virtualList({
		list: () => rows,
		count: () => list.ids.length,
	});
	const visibleIds = $derived(list.ids.slice(view.startIndex, view.endIndex));

	const scroller = $derived(
		root ? (nearestScrollableAncestor(root) as HTMLElement | null) : null,
	);
	const rowIds = $derived(list.loading ? [] : list.ids);

	function rowGeometry(): {
		topPx: number;
		rowPx: number;
		stridePx: number;
	} | null {
		if (!rows || !scroller) return null;
		const style = getComputedStyle(rows);
		const rowPx = Number.parseFloat(style.gridAutoRows) || 0;
		if (rowPx <= 0) return null;
		return {
			topPx:
				rows.getBoundingClientRect().top -
				scroller.getBoundingClientRect().top +
				scroller.scrollTop,
			rowPx,
			stridePx: rowPx + (Number.parseFloat(style.rowGap) || 0),
		};
	}

	const roving = new RovingFocusState({
		keys: () => rowIds,
		orientation: "vertical",
		cells: (row) => {
			const controls = [
				...row.querySelectorAll<HTMLElement>("a[href], button"),
			];
			if (controls.length > 0) return controls;
			return [row.querySelector<HTMLElement>('[role="gridcell"]') ?? row];
		},
		pageRows: () => {
			const geometry = rowGeometry();
			if (geometry === null) return 1;
			const band = visibleBand(scroller);
			const rowsPerBand = (band.bottom - band.top) / geometry.stridePx;
			return Math.max(1, Math.floor(rowsPerBand));
		},
		reveal: (index) => {
			const geometry = rowGeometry();
			if (!scroller || geometry === null) return;
			const style = getComputedStyle(scroller);
			scroller.scrollTop = revealRowScrollTop({
				savedTop: scroller.scrollTop,
				rowTopPx: geometry.topPx + index * geometry.stridePx,
				rowHeightPx: geometry.rowPx,
				viewportPx: scroller.clientHeight,
				insetTopPx: Number.parseFloat(style.scrollPaddingTop) || 0,
				insetBottomPx:
					Number.parseFloat(style.scrollPaddingBottom) || 0,
				maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
			});
		},
		openerScope,
		emptyFallback: () => emptyState,
	});

	restoreScrollOnce({
		container: () => scroller,
		state: {
			get loading() {
				return list.loading;
			},
			get error() {
				return list.error;
			},
			get scrollY() {
				return scroll?.scrollY ?? 0;
			},
		},
	});

	beforeNavigate(() => {
		if (scroll && scroller) scroll.scrollY = scroller.scrollTop;
	});

	onDestroy(() => list.dispose());

	$effect(() => {
		list.setVisible({ start: view.startIndex, end: view.endIndex });
	});
</script>

<div bind:this={root} {@attach roving.container} class="flex flex-1 flex-col">
	{#if list.error}
		<div class="flex flex-1">
			<ApiErrorDisplay
				error={list.error}
				onRetry={() => void list.load()}
				class="m-auto"
			/>
		</div>
	{:else if !list.loading && list.ids.length === 0}
		<div class="flex flex-1">
			<Empty.Root bind:ref={emptyState} tabindex={-1} class="m-auto">
				<Empty.Header>
					<Empty.Media variant="icon">
						{#if emptyIcon}
							{@render emptyIcon()}
						{:else}
							{@render icon(true)}
						{/if}
					</Empty.Media>
					<Empty.Title>{empty.title}</Empty.Title>
					<Empty.Description>{empty.description}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div
			bind:this={rows}
			data-slot="profile-list-rows"
			role="grid"
			aria-label={gridName}
			aria-busy={list.loading}
			aria-rowcount={list.loading ? undefined : list.ids.length}
			class="grid auto-rows-[--spacing(24.5)] gap-3"
			style:padding-top="{view.paddingTopPx}px"
			style:padding-bottom="{view.paddingBottomPx}px"
		>
			{#if list.loading}
				{#each Array(skeletons)}
					<Skeleton />
				{/each}
			{:else}
				{#each visibleIds as profileId, offset (profileId)}
					{@const profile = list.profile(profileId)}
					{@const rowIndex = view.startIndex + offset + 1}
					{#if profile === undefined}
						<div
							role="row"
							aria-rowindex={rowIndex}
							class="grid"
							{@attach roving.item(profileId)}
						>
							<Skeleton
								role="gridcell"
								aria-busy="true"
								aria-label={t(
									"common.profileList.a11y.loadingProfile",
								)}
							/>
						</div>
					{:else}
						<ProfileListRow
							{@attach roving.item(profileId)}
							aria-rowindex={rowIndex}
							{profileId}
							{profile}
							{icon}
							{control}
							{label}
							on={list.isOn(profileId)}
							submitting={list.isSubmitting(profileId)}
							onToggle={() => void list.toggle(profileId)}
						/>
					{/if}
				{/each}
			{/if}
		</div>
	{/if}
	<ScrollToTopButton
		container={scroller}
		class="fixed bottom-nav-clear"
		onjump={({ keyboardFocused }) => {
			if (keyboardFocused) void roving.focusFirst();
		}}
	/>
</div>
