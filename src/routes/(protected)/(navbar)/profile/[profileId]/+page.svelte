<script lang="ts">
	import { page } from "$app/state";

	import { getProfile } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import AboutMe from "./AboutMe.svelte";
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
	const profile = $derived(getProfile(profileId));
</script>

<div class="flex flex-1">
	<main class="w-full max-w-200 flex-1 mx-auto relative">
		{#await profile}
			<Skeleton />
		{:then profile}
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
			<ProfileTopNavBar {ourProfileId} {profileId} {profile} />
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
						<span class="uppercase text-sm text-muted-foreground">Health</span>
						<HivStatus {hivStatus} />
						<LastTested lastTestedDate={lastTestedDateValue} />
						<HealthPractices healthPractices={sexualHealthValue} />
					</div>
				{/if}
				{#if socialNetworks && Object.keys(socialNetworks).length > 0}
					<div class="flex flex-col gap-2 mt-4">
						<span class="uppercase text-sm text-muted-foreground">Socials</span>
						<Socials socials={socialNetworks} />
					</div>
				{/if}
			</div>
			<ProfileBottomNavBar {ourProfileId} {profileId} {tapType} />
		{:catch error}
			<div class="h-full flex">
				<ApiErrorDisplay {error} class="m-auto" />
			</div>
		{/await}
	</main>
</div>
