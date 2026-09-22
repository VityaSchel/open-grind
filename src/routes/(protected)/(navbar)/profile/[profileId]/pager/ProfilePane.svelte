<script lang="ts">
	import { ArrowClockwiseIcon } from "phosphor-svelte";

	import {
		BlockedProfileError,
		HiddenProfileError,
		isUnviewableProfileError,
		ProfileUnavailableError,
	} from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { RenderedGridProfile } from "$lib/grid/grid";
	import BlockedProfile from "../BlockedProfile.svelte";
	import ProfileBottomNavBar from "../bottom-nav/ProfileBottomNavBar.svelte";
	import HiddenProfile from "../HiddenProfile.svelte";
	import ImageCarousel from "../ImageCarousel.svelte";
	import type { ProfileState } from "../profile-state.svelte";
	import ProfileBody from "../ProfileBody.svelte";
	import ProfilePreview from "../ProfilePreview.svelte";

	let {
		profileState,
		position,
		active,
		row,
		heroHash,
	}: {
		profileState: ProfileState;
		position: number;
		active: boolean;
		row: RenderedGridProfile | null;
		heroHash: string | null;
	} = $props();

	let scroller = $state<HTMLElement | null>(null);

	const profile = $derived(profileState.profile);
	const error = $derived(profileState.error);
	const ourProfile = $derived(profileState.isOurProfile);
	const scrollerHooks = $derived(
		active ? { "data-slot": "profile-scroller" } : { tabindex: -1 },
	);
	const showsErrorScreen = $derived(
		error !== null && (row === null || isUnviewableProfileError(error)),
	);
	const medias = $derived(
		profile?.medias ??
			(heroHash === null
				? []
				: [
						{
							mediaHash: heroHash,
							takenOnGrindr: null,
							createdAt: null,
						},
					]),
	);
</script>

<section
	data-slot="profile-pane"
	aria-hidden={active ? undefined : "true"}
	class="absolute inset-y-0 w-full bg-background contain-strict"
	style:left="{position * 100}%"
>
	{#if showsErrorScreen}
		<div
			inert={!active}
			class="flex size-full overflow-y-auto pb-(--nav-height)"
		>
			{#if error instanceof BlockedProfileError}
				<BlockedProfile
					profileId={profileState.profileId}
					blockedByUs={error.blockedByUs}
					onRefresh={() => profileState.markViewable()}
				/>
			{:else if error instanceof HiddenProfileError}
				<HiddenProfile
					profileId={profileState.profileId}
					onRefresh={() => profileState.markViewable()}
				/>
			{:else if error instanceof ProfileUnavailableError}
				<NotFound />
			{:else}
				<ApiErrorDisplay
					{error}
					onRetry={() => profileState.retry()}
					class="m-auto"
				/>
			{/if}
		</div>
	{:else}
		<div
			bind:this={scroller}
			{...scrollerHooks}
			class="h-full overflow-x-hidden overflow-y-auto overscroll-contain overscroll-x-auto"
		>
			<main
				inert={!active}
				class="relative mx-auto min-h-overscrollable w-full max-w-200"
			>
				{#if profile || medias.length > 0}
					<ImageCarousel {medias} />
				{:else}
					<Skeleton
						class="aspect-3/4 h-auto max-h-photo w-full rounded-none"
					/>
				{/if}
				{#if profile}
					<ProfileBody {profileState} />
				{:else if row}
					<ProfilePreview {row} {ourProfile} />
					{#if error}
						<div class="flex justify-center">
							<Button
								variant="secondary"
								size="icon-lg"
								aria-label="Retry"
								onclick={() => profileState.retry()}
							>
								<ArrowClockwiseIcon weight="bold" />
							</Button>
						</div>
					{/if}
				{:else}
					<div
						class={[
							"flex max-w-full flex-col gap-3.5 p-4",
							{ "pb-24": ourProfile, "pb-40": !ourProfile },
						]}
					>
						<Skeleton class="h-6 w-40 max-w-full" />
						<Skeleton class="h-3 w-30 max-w-full" />
						<Skeleton class="mt-0.5 h-3 w-50 max-w-full" />
						<div class="mt-2 flex flex-wrap gap-1">
							{#each [10, 12, 18, 16, 15] as w, i (i)}
								<Skeleton
									class="h-4.5 w-(--w)"
									--w="calc(var(--spacing) * {w})"
								/>
							{/each}
						</div>
						<Skeleton class="mt-2.25 h-27 w-full rounded-4xl" />
					</div>
				{/if}
			</main>
		</div>
		{#if profile}
			<ProfileBottomNavBar
				ourProfileId={profileState.ourProfileId}
				profileId={profile.profileId}
				tapType={profile.tapType}
				{active}
				onTap={(tapType) => profileState.setTap(tapType)}
			/>
		{/if}
		{#if active}
			<DataRefreshControl
				container={scroller}
				updating={profileState.refreshing}
				position="top"
				onrefresh={() => profileState.refresh()}
			/>
		{/if}
	{/if}
</section>
