<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { onDestroy, onMount, untrack } from "svelte";
	import { tinykeys } from "tinykeys";

	import { gridState } from "$lib/grid/grid-state.svelte";
	import { navigationPending } from "$lib/util/history";
	import { keyboardPagingBlocked } from "$lib/util/keyboard-paging";
	import {
		isPhotoSwipeBusy,
		onPhotoSwipeIdle,
		onPhotoSwipeOpening,
	} from "$lib/util/photoswipe";
	import { SnapPager } from "$lib/util/snap-pager";
	import {
		type ProfilePagerEntry,
		ProfilePagerModel,
	} from "./profile-pager.svelte";
	import ProfilePane from "./ProfilePane.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const entry = $derived<ProfilePagerEntry>({
		profileId: Number(page.params.profileId),
		ourProfileId,
		origin: page.state.profileOrigin ?? null,
	});

	const pager = untrack(
		() =>
			new ProfilePagerModel({
				source: gridState,
				...entry,
				historyTraversal: navigating.type === "popstate",
			}),
	);

	let pendingPathname: string | null = null;

	const snap = new SnapPager({
		count: () => pager.track.length,
		onVisible: (positions) => pager.setVisiblePositions(positions),
		onRest: (position) => {
			if (
				position === pager.activePosition ||
				isPhotoSwipeBusy() ||
				navigationPending({
					owns: (pathname) => pathname === pendingPathname,
				})
			)
				return;
			const profileId = pager.commit({ position });
			if (profileId === null) return;
			const pathname = `/profile/${profileId}`;
			pendingPathname = pathname;
			void goto(pathname, {
				replaceState: true,
				noScroll: true,
				keepFocus: true,
				state: { profileOrigin: "browse" },
			}).finally(() => {
				if (pendingPathname === pathname) pendingPathname = null;
			});
		},
	});

	$effect.pre(() => {
		const next = entry;
		untrack(() => {
			if (!pager.needsReset(next)) return;
			pager.reset({
				...next,
				historyTraversal: navigating.type === "popstate",
			});
		});
	});

	$effect(() => {
		void pager.generation;
		untrack(() => snap.place(pager.activePosition));
	});

	$effect(() => {
		void gridState.profiles;
		untrack(() => pager.absorbGridGrowth());
	});

	function stepByKey(event: KeyboardEvent, offset: number) {
		if (keyboardPagingBlocked({ event, lightboxBusy: isPhotoSwipeBusy() }))
			return;
		event.preventDefault();
		snap.step(offset);
	}

	onMount(() =>
		tinykeys(window, {
			ArrowLeft: (event) => stepByKey(event, -1),
			ArrowRight: (event) => stepByKey(event, 1),
		}),
	);

	afterNavigate(() => snap.settleNow());

	$effect(() => onPhotoSwipeOpening(() => snap.place(pager.activePosition)));

	$effect(() => onPhotoSwipeIdle(() => snap.settleNow()));

	onDestroy(() => pager.destroy());
</script>

<div
	data-slot="profile-pager"
	tabindex="-1"
	class="relative -mb-(--nav-height) no-scrollbar h-screen-safe w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
	{@attach snap.attach}
>
	{#each pager.track as profileId, position (profileId)}
		<div
			data-slot="profile-pager-stop"
			aria-hidden="true"
			class="pointer-events-none absolute inset-y-0 w-full snap-start snap-always contain-strict"
			style:left="{position * 100}%"
		></div>
	{/each}
	{#each pager.mounted as { position, profileId, state } (state)}
		<ProfilePane
			profileState={state}
			{position}
			role={pager.role(position)}
			row={pager.row(profileId)}
			heroHash={pager.heroHash(profileId)}
		/>
	{/each}
</div>
