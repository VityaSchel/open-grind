<script lang="ts">
	import { page } from "$app/state";
	import {
		CameraIcon,
		EyesIcon,
		GlobeStandIcon,
		HeartbeatIcon,
		HouseIcon,
		UsersIcon,
		UsersThreeIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";

	import {
		BlockedProfileError,
		ProfileUnavailableError,
	} from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		acceptNSFWPics,
		ethnicities,
		healthPractices,
		hivStatuses,
		lookingFor as lookingForLabels,
		meetAt as meetAtLabels,
		relationshipStatuses,
		tribes,
	} from "$lib/model/users/profiles";
	import AboutMe from "./AboutMe.svelte";
	import BlockedProfile from "./BlockedProfile.svelte";
	import ProfileBottomNavBar from "./bottom-nav/ProfileBottomNavBar.svelte";
	import Distance from "./Distance.svelte";
	import Genders from "./fields/GendersPronouns.svelte";
	import HivStatusIcon from "./fields/HivStatusIcon.svelte";
	import LastTested from "./fields/LastTested.svelte";
	import LookupField from "./fields/LookupField.svelte";
	import Socials from "./fields/Socials.svelte";
	import Height from "./HeightWeightBodyType.svelte";
	import ImageCarousel from "./ImageCarousel.svelte";
	import OnlineStatus from "./OnlineStatus.svelte";
	import { ProfileState } from "./profile-state.svelte";
	import ProfileSection from "./ProfileSection.svelte";
	import ProfileTags from "./ProfileTags.svelte";
	import SexualPosition from "./SexualPosition.svelte";
	import ProfileTopNavBar from "./top-nav/ProfileTopNavBar.svelte";

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

	const profile = $derived(profileState.profile);
	const error = $derived(profileState.error);
	const ourProfile = $derived(profileState.isOurProfile);
</script>

{#if error}
	<div class="flex flex-1">
		{#if error instanceof BlockedProfileError}
			<BlockedProfile
				profileId={profileState.profileId}
				blockedByUs={error.blockedByUs}
				onRefresh={() => profileState.markUnblocked()}
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
				{#if profileState.loading || !profile}
					<div class="flex max-w-full flex-col">
						<Skeleton
							class="aspect-3/4 h-auto max-h-photo w-full rounded-none"
						/>

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
					</div>
				{:else}
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
					} = profile}
					<ImageCarousel {medias} />
					<ProfileTopNavBar
						ourProfileId={profileState.ourProfileId}
						{profile}
						onBlocked={() => profileState.markBlocked()}
						onFavorite={(isFavorite) =>
							profileState.setFavorite(isFavorite)}
					/>
					<div
						class={[
							"flex flex-col p-4",
							{ "pb-24": ourProfile, "pb-40": !ourProfile },
						]}
					>
						<h1 class="text-2xl wrap-break-word">
							{#if displayName !== null}
								<span class="font-semibold">
									{displayName}
								</span>{:else}<span
									class="font-normal tracking-tight text-muted-foreground italic"
								>
									Someone
								</span>{/if}{#if age !== null}, {age}
							{/if}
						</h1>
						<div class="mt-1 flex items-center gap-3 text-sm">
							<OnlineStatus
								onlineUntil={onlineUntil ?? null}
								{seen}
								self={ourProfile}
							/>
							<Distance {distance} />
						</div>
						{#if sexualPosition !== null || height !== null || weight !== null || bodyType !== null}
							<div class="mt-2 flex items-center gap-3 text-sm">
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
							<ProfileSection title="Stats">
								<Genders {genders} {pronouns} />
								<LookupField
									icon={UsersThreeIcon}
									value={grindrTribes}
									options={tribes}
								/>
								<LookupField
									icon={GlobeStandIcon}
									value={ethnicity}
									options={ethnicities}
								/>
								<LookupField
									icon={UsersIcon}
									value={relationshipStatus}
									options={relationshipStatuses}
								/>
							</ProfileSection>
						{/if}
						{#if (lookingFor && lookingFor.length > 0) || (meetAt && meetAt.length > 0) || nsfw !== null}
							<ProfileSection title="Expectations">
								<LookupField
									icon={EyesIcon}
									weight="fill"
									label="Looking For"
									value={lookingFor}
									options={lookingForLabels}
								/>
								<LookupField
									icon={HouseIcon}
									label="Meet At"
									value={meetAt}
									options={meetAtLabels}
								/>
								<LookupField
									icon={CameraIcon}
									label="NSFW Pics?"
									value={nsfw}
									options={acceptNSFWPics}
								/>
							</ProfileSection>
						{/if}
						{#if hivStatus !== null || lastTestedDateValue !== null || (sexualHealthValue && sexualHealthValue.length > 0)}
							<ProfileSection title="Health">
								<LookupField
									icon={HivStatusIcon}
									label="HIV Status"
									value={hivStatus}
									options={hivStatuses}
								/>
								<LastTested
									lastTestedDate={lastTestedDateValue}
								/>
								<LookupField
									icon={HeartbeatIcon}
									label="Health Practices"
									value={sexualHealthValue}
									options={healthPractices}
								/>
							</ProfileSection>
						{/if}
						{#if socialNetworks && Object.keys(socialNetworks).length > 0}
							<ProfileSection title="Socials">
								<Socials socials={socialNetworks} />
							</ProfileSection>
						{/if}
					</div>
					<ProfileBottomNavBar
						ourProfileId={profileState.ourProfileId}
						profileId={profile.profileId}
						tapType={profile.tapType}
						onTap={(tapType) => profileState.setTap(tapType)}
					/>
				{/if}
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
