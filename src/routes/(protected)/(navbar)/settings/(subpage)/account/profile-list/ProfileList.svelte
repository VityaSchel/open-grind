<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { onDestroy } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { nearestScrollableAncestor } from "$lib/util/scroll";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import { virtualList } from "$lib/util/virtual-list.svelte";
	import type { ProfileListToggle } from "./profile-list";
	import { ProfileListState } from "./profile-list-state.svelte";
	import ProfileListRow from "./ProfileListRow.svelte";

	const LOADING_SKELETONS = 6;

	let {
		loadIds,
		empty,
		scroll,
		eager = false,
		icon,
		label,
		errorLabel,
		setOn,
	}: {
		loadIds: () => Promise<number[]>;
		empty: { title: string; description: string };
		scroll: { scrollY: number };
		eager?: boolean;
	} & ProfileListToggle = $props();

	const list = new ProfileListState(() => ({
		loadIds,
		setOn,
		errorLabel,
		eager,
	}));

	let root: HTMLElement | null = $state(null);
	let rows: HTMLElement | null = $state(null);

	const view = virtualList({
		list: () => rows,
		count: () => list.ids.length,
	});
	const visibleIds = $derived(list.ids.slice(view.startIndex, view.endIndex));

	const scroller = $derived(
		root ? (nearestScrollableAncestor(root) as HTMLElement | null) : null,
	);

	restoreScrollOnce(() => scroller, {
		get loading() {
			return list.loading;
		},
		get error() {
			return list.error;
		},
		get scrollY() {
			return scroll.scrollY;
		},
	});

	beforeNavigate(() => {
		if (scroller) scroll.scrollY = scroller.scrollTop;
	});

	onDestroy(() => list.dispose());

	$effect(() => {
		list.setVisible({ start: view.startIndex, end: view.endIndex });
	});
</script>

<div bind:this={root} class="flex flex-1 flex-col">
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
			<Empty.Root class="m-auto">
				<Empty.Header>
					<Empty.Media variant="icon">
						{@render icon(true)}
					</Empty.Media>
					<Empty.Title>{empty.title}</Empty.Title>
					<Empty.Description>{empty.description}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div
			bind:this={rows}
			class="grid auto-rows-[--spacing(24.5)] gap-3"
			style:padding-top="{view.paddingTopPx}px"
			style:padding-bottom="{view.paddingBottomPx}px"
		>
			{#if list.loading}
				{#each Array(LOADING_SKELETONS)}
					<Skeleton />
				{/each}
			{:else}
				{#each visibleIds as profileId (profileId)}
					{@const profile = list.profile(profileId)}
					{#if profile === undefined}
						<Skeleton />
					{:else}
						<ProfileListRow
							{profileId}
							{profile}
							{icon}
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
</div>
