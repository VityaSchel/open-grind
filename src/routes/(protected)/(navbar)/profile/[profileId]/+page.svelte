<script lang="ts">
	import { page } from "$app/state";

	import { showErrorToast } from "$lib/api/error";
	import { recordProfileView } from "$lib/api/interest/views";
	import {
		BlockedProfileError,
		getProfile,
		invalidateProfile,
	} from "$lib/api/users/profiles";
	import { getPreferences } from "$lib/app-data/preferences.svelte";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/DataRefreshControl.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import type { Profile } from "$lib/model/profile";
	import AboutMe from "./AboutMe.svelte";
	import BlockedProfile from "./BlockedProfile.svelte";
	import ProfileBottomNavBar from "./bottom-nav/ProfileBottomNavBar.svelte";
	import Distance from "./Distance.svelte";
	import Ethnicity from "./fields/Ethnicity.svelte";
	import Genders from "./fields/GendersPronouns.svelte";
	import HealthPractices from "./fields/HealthPractices.svelte";
	import HivStatus from "./fields/HivStatus.svelte";
	import LastTested from "./fields/LastTested.svelte";
	import LookingFor from "./fields/LookingFor.svelte";
	import MeetAt from "./fields/MeetAt.svelte";
	import NSFWPics from "./fields/NSFWPics.svelte";
	import RelationshipStatus from "./fields/RelationshipStatus.svelte";
	import Socials from "./fields/Socials.svelte";
	import Tribes from "./fields/Tribes.svelte";
	import Height from "./HeightWeightBodyType.svelte";
	import ImageCarousel from "./ImageCarousel.svelte";
	import OnlineStatus from "./OnlineStatus.svelte";
	import ProfileTags from "./ProfileTags.svelte";
	import SexualPosition from "./SexualPosition.svelte";
	import ProfileTopNavBar from "./top-nav/ProfileTopNavBar.svelte";

	let { data }: import("./$types").PageProps = $props();

	const ourProfileId = $derived(data.ourProfileId);
	const profileId = $derived(Number(page.params.profileId));

	let profileContainer = $state<HTMLElement | null>(null);
	let profile = $state<Profile | null>(null);
	let loading = $state(true);
	let loadError = $state<Error | null>(null);
	let refreshing = $state(false);

	async function loadProfile(id: number, isRefresh: boolean) {
		if (isRefresh) {
			refreshing = true;
			invalidateProfile(id);
		} else {
			loading = true;
			loadError = null;
			profile = null;
		}
		try {
			const result = await getProfile(id);
			if (id !== profileId) return;
			profile = result;
			loadError = null;
		} catch (error) {
			if (id !== profileId) return;
			loadError = error instanceof Error ? error : new Error(String(error));
			profile = null;
		} finally {
			if (id === profileId) {
				loading = false;
				refreshing = false;
			}
		}
	}

	$effect(() => {
		const id = profileId;
		if (!Number.isFinite(id)) return;
		void loadProfile(id, false);
	});

	function refresh() {
		if (refreshing || loading) return;
		void loadProfile(profileId, true);
	}

	$effect(() => {
		const id = profileId;
		if (!Number.isFinite(id) || id === ourProfileId) return;
		void (async () => {
			try {
				const { revealProfileViews } = await getPreferences();
				if (!revealProfileViews) return;
				await recordProfileView({ profileId: id });
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to record profile view preference or action",
					error,
				});
			}
		})();
	});

	let optimisticBlockProfileId = $state<number | null>(null);
	const optimisticallyBlocked = $derived(
		optimisticBlockProfileId === profileId,
	);
</script>

<div
	class="h-[calc(100dvh-var(--safe-area-top)-var(--content-pb))] overflow-y-auto overscroll-contain"
	bind:this={profileContainer}
>
	<main class="w-full max-w-200 mx-auto relative min-h-full">
		<DataRefreshControl
			container={profileContainer}
			updating={refreshing}
			position="top"
			class="my-3"
			containerClass="z-10"
			onclick={refresh}
		/>
		{#if optimisticallyBlocked}
			<div class="h-full flex">
				<BlockedProfile
					blockedByUs={true}
					onRefresh={() => {
						optimisticBlockProfileId = null;
					}}
				/>
			</div>
		{:else if loadError instanceof BlockedProfileError}
			<div class="h-full flex">
				<BlockedProfile
					blockedByUs={loadError.blockedByUs}
					onRefresh={() => void loadProfile(profileId, false)}
				/>
			</div>
		{:else if loadError}
			<div class="h-full flex">
				<ApiErrorDisplay
					error={loadError}
					onRetry={() => void loadProfile(profileId, false)}
					class="m-auto"
				/>
			</div>
		{:else if profile && !loading}
			{@const {
				displayName,
				age,
				onlineUntil,
				seen,
				distance,
				sexualPosition,
				height,
				weight,
				bodyType,
				profileTags,
				aboutMe,
				genders,
				pronouns,
				ethnicity,
				relationshipStatus,
				grindrTribes,
				lookingFor,
				meetAt,
				nsfw,
				hivStatus,
				lastTestedDate: lastTestedDateValue,
				sexualHealth: sexualHealthValue,
				socialNetworks,
				medias,
				tapType,
			} = profile}
			<ImageCarousel {medias} />
			<ProfileTopNavBar
				{ourProfileId}
				{profile}
				onBlocked={() => {
					optimisticBlockProfileId = profileId;
				}}
			/>
			<div class="flex flex-col p-4 pb-24">
				<h1 class="text-2xl wrap-break-word">
					{#if displayName !== null}
						<span class="font-semibold">
							{displayName}
						</span>{:else}<span
							class="font-normal tracking-tight italic text-muted-foreground"
						>
							Someone
						</span>{/if}{#if age !== null}, {age}
					{/if}
				</h1>
				<div class="flex items-center gap-3 text-sm mt-1">
					<OnlineStatus onlineUntil={onlineUntil ?? null} {seen} />
					<Distance {distance} />
				</div>
				{#if sexualPosition !== null || height !== null || weight !== null || bodyType !== null}
					<div class="flex items-center gap-3 text-sm mt-2">
						{#if sexualPosition !== null && sexualPosition !== undefined}
							<SexualPosition {sexualPosition} />
						{/if}
						<Height {height} {weight} {bodyType} />
					</div>
				{/if}
				<ProfileTags tags={profileTags} />
				{#if aboutMe !== null}
					<AboutMe>{aboutMe}</AboutMe>
				{/if}
				{#if (genders && genders.length > 0) || (pronouns && pronouns.length > 0) || ethnicity !== null || relationshipStatus !== null || (grindrTribes && grindrTribes.length > 0)}
					<div class="flex flex-col gap-2 mt-4">
						<span class="uppercase text-sm text-muted-foreground">Stats</span>
						<Genders {genders} {pronouns} />
						<Tribes tribes={grindrTribes} />
						<Ethnicity {ethnicity} />
						<RelationshipStatus {relationshipStatus} />
					</div>
				{/if}
				{#if (lookingFor && lookingFor.length > 0) || (meetAt && meetAt.length > 0) || nsfw !== null}
					<div class="flex flex-col gap-2 mt-4">
						<span class="uppercase text-sm text-muted-foreground">
							Expectations
						</span>
						<LookingFor {lookingFor} />
						<MeetAt {meetAt} />
						<NSFWPics nsfwPics={nsfw} />
					</div>
				{/if}
				{#if hivStatus !== null || lastTestedDateValue !== null || (sexualHealthValue && sexualHealthValue.length > 0)}
					<div class="flex flex-col gap-2 mt-4">
						<span class="uppercase text-sm text-muted-foreground">
							Health
						</span>
						<HivStatus {hivStatus} />
						<LastTested lastTestedDate={lastTestedDateValue} />
						<HealthPractices healthPractices={sexualHealthValue} />
					</div>
				{/if}
				{#if socialNetworks && Object.keys(socialNetworks).length > 0}
					<div class="flex flex-col gap-2 mt-4">
						<span class="uppercase text-sm text-muted-foreground">
							Socials
						</span>
						<Socials socials={socialNetworks} />
					</div>
				{/if}
			</div>
			<ProfileBottomNavBar {ourProfileId} {profileId} {tapType} />
		{:else}
			<Skeleton />
		{/if}
	</main>
</div>
