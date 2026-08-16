<script lang="ts">
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import {
		BlockedProfileError,
		HiddenProfileError,
		ProfileUnavailableError,
	} from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import BlockedProfile from "./BlockedProfile.svelte";
	import HiddenProfile from "./HiddenProfile.svelte";
	import { ProfileState } from "./profile-state.svelte";
	import ProfileBody from "./ProfileBody.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);
	const profileId = $derived(Number(page.params.profileId));

	let profileContainer = $state<HTMLElement | null>(null);

	let profileState = $state(
		untrack(() => new ProfileState({ profileId, ourProfileId })),
	);

	$effect(() => {
		const id = profileId;
		const ourId = ourProfileId;

		const state = untrack(() => {
			if (
				id !== profileState.profileId ||
				ourId !== profileState.ourProfileId
			) {
				profileState = new ProfileState({
					profileId: id,
					ourProfileId: ourId,
				});
			}
			return profileState;
		});

		return () => state.destroy();
	});

	const error = $derived(profileState.error);
</script>

{#if error}
	<div class="flex flex-1">
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
	<div class="relative -mb-(--nav-height) h-screen-safe">
		<div
			class="h-full overflow-y-auto overscroll-contain"
			bind:this={profileContainer}
		>
			<main
				class="relative mx-auto min-h-overscrollable w-full max-w-200"
			>
				<ProfileBody {profileState} />
			</main>
		</div>
		<DataRefreshControl
			container={profileContainer}
			updating={profileState.refreshing}
			position="top"
			onrefresh={() => profileState.refresh()}
		/>
	</div>
{/if}
