<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { onDestroy, onMount, tick, untrack } from "svelte";
	import { on } from "svelte/events";
	import { tinykeys } from "tinykeys";
	import type { Attachment } from "svelte/attachments";

	import { holdScreenLanding } from "#lib/components/navigation/stack/screen-root.ts";
	import { gridState } from "#lib/grid/grid-state.svelte.ts";
	import { stackInMotion } from "#lib/platform/system-back-gesture.svelte.ts";
	import { navigationPending } from "#lib/util/history.ts";
	import {
		isPhotoSwipeBusy,
		onPhotoSwipeIdle,
		onPhotoSwipeOpening,
	} from "#lib/util/photoswipe/index.ts";
	import { SnapPager } from "#lib/util/snap-pager.ts";
	import { arrowKeyAction } from "./keyboard-paging";
	import {
		type ProfilePagerEntry,
		ProfilePagerState,
	} from "./profile-pager-state.svelte";
	import { ProfileScrollMemory } from "./profile-scroll-memory";
	import ProfilePane from "./ProfilePane.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const entry = $derived<ProfilePagerEntry>({
		profileId: Number(page.params.profileId),
		ourProfileId,
		origin: page.state.profileOrigin ?? null,
	});

	const pager = untrack(
		() =>
			new ProfilePagerState({
				source: gridState,
				...entry,
				historyTraversal: navigating.type === "popstate",
			}),
	);

	const scrollMemory = new ProfileScrollMemory();
	untrack(() =>
		scrollMemory.enter({ traversal: navigating.type === "popstate" }),
	);
	let releaseLanding = holdScreenLanding();

	let pagerNode: HTMLElement | null = null;
	let pendingPathname: string | null = null;
	let stackWasMoving = false;

	const snap = new SnapPager({
		count: () => pager.track.length,
		onVisible: (positions) => pager.setVisiblePositions(positions),
		onHeading: (position) => pager.setHeading(position),
		onRest: (position) => {
			if (
				position === pager.activePosition ||
				isPhotoSwipeBusy() ||
				stackInMotion() ||
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
				replace: true,
				reset: false,
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
			const historyTraversal = navigating.type === "popstate";
			releaseLanding();
			releaseLanding = holdScreenLanding();
			scrollMemory.enter({ traversal: historyTraversal });
			pager.reset({ ...next, historyTraversal });
		});
	});

	const activeProfile = $derived(
		pager.mounted.find(({ position }) => position === pager.activePosition)
			?.state,
	);

	$effect(() => {
		if (!activeProfile || activeProfile.loading) return;
		const { profileId } = activeProfile;
		const release = releaseLanding;
		void tick().then(() => {
			scrollMemory.restore({
				profileId,
				scroller:
					pagerNode?.querySelector<HTMLElement>(
						'[data-slot="profile-scroller"]',
					) ?? null,
			});
			release();
		});
	});

	const rememberScroll: Attachment<HTMLElement> = (node) => {
		pagerNode = node;
		const stopListening = on(
			node,
			"scroll",
			({ target }) => {
				const profileId = pager.activeId;
				if (
					profileId === undefined ||
					!(target instanceof HTMLElement) ||
					target.dataset.slot !== "profile-scroller"
				)
					return;
				scrollMemory.remember({
					profileId,
					scrollTop: target.scrollTop,
				});
			},
			{ capture: true, passive: true },
		);
		return () => {
			stopListening();
			if (pagerNode === node) pagerNode = null;
		};
	};

	$effect(() => {
		const moving = stackInMotion();
		if (stackWasMoving && !moving) untrack(() => snap.settleNow());
		stackWasMoving = moving;
	});

	$effect(() => {
		void pager.generation;
		untrack(() => snap.place(pager.activePosition));
	});

	$effect(() => {
		void gridState.profiles;
		untrack(() => pager.absorbGridGrowth());
	});

	function stepByKey({
		event,
		offset,
	}: {
		event: KeyboardEvent;
		offset: number;
	}) {
		const action = arrowKeyAction({
			event,
			lightboxBusy: isPhotoSwipeBusy(),
		});
		if (action === "ignore") return;
		event.preventDefault();
		if (action === "page") snap.step(offset);
	}

	onMount(() =>
		tinykeys(window, {
			ArrowLeft: (event) => stepByKey({ event, offset: -1 }),
			ArrowRight: (event) => stepByKey({ event, offset: 1 }),
		}),
	);

	afterNavigate(() => snap.settleNow());

	$effect(() => onPhotoSwipeOpening(() => snap.place(pager.activePosition)));

	$effect(() => onPhotoSwipeIdle(() => snap.settleNow()));

	onDestroy(() => {
		releaseLanding();
		pager.destroy();
	});
</script>

<div
	data-slot="profile-pager"
	tabindex="-1"
	class="relative -mb-(--nav-height) no-scrollbar h-screen-safe w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
	{@attach snap.attach}
	{@attach rememberScroll}
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
			active={position === pager.activePosition}
			leaving={pager.leaving({ position })}
			row={pager.row(profileId)}
			heroHash={pager.heroHash(profileId)}
		/>
	{/each}
</div>
