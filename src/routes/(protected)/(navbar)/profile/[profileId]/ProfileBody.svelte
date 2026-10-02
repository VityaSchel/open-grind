<script lang="ts">
	import {
		CameraIcon,
		EyesIcon,
		GlobeStandIcon,
		HeartbeatIcon,
		HouseIcon,
		UsersIcon,
		UsersThreeIcon,
	} from "phosphor-svelte";

	import {
		acceptNSFWPics,
		ethnicities,
		healthPracticeLabels,
		hivStatusLabels,
		lookingFor as lookingForLabels,
		meetAt as meetAtLabels,
		relationshipStatuses,
		tribes,
	} from "$lib/model/users/profiles";
	import AboutMe from "./AboutMe.svelte";
	import Distance from "./Distance.svelte";
	import Genders from "./fields/GendersPronouns.svelte";
	import HivStatusIcon from "./fields/HivStatusIcon.svelte";
	import LastTested from "./fields/LastTested.svelte";
	import LookupField from "./fields/LookupField.svelte";
	import Socials from "./fields/Socials.svelte";
	import Height from "./HeightWeightBodyType.svelte";
	import NewBadge from "./NewBadge.svelte";
	import OnlineStatus from "./OnlineStatus.svelte";
	import type { ProfileState } from "./profile-state.svelte";
	import ProfileHeading from "./ProfileHeading.svelte";
	import ProfileSection from "./ProfileSection.svelte";
	import ProfileTags from "./ProfileTags.svelte";
	import SexualPosition from "./SexualPosition.svelte";

	let { profileState }: { profileState: ProfileState } = $props();

	const profile = $derived(profileState.profile);
	const ourProfile = $derived(profileState.isOurProfile);
</script>

{#if profile}
	{@const {
		displayName,
		age,
		onlineUntil,
		seen,
		distance,
		isNew,
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
	} = profile}
	<div
		class={[
			"flex flex-col p-4",
			{ "pb-24": ourProfile, "pb-40": !ourProfile },
		]}
	>
		<ProfileHeading {displayName} {age} />
		<div
			data-slot="profile-status-row"
			class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
		>
			<OnlineStatus
				onlineUntil={onlineUntil ?? null}
				{seen}
				self={ourProfile}
			/>
			<Distance {distance} />
			<NewBadge {isNew} />
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
		<ProfileSection title="Health">
			<LookupField
				icon={HivStatusIcon}
				label="HIV Status"
				value={hivStatus}
				options={hivStatusLabels}
			/>
			<LastTested lastTestedDate={lastTestedDateValue} />
			<LookupField
				icon={HeartbeatIcon}
				label="Health Practices"
				value={sexualHealthValue}
				options={healthPracticeLabels}
			/>
		</ProfileSection>
		<ProfileSection title="Socials">
			<Socials socials={socialNetworks} />
		</ProfileSection>
	</div>
{/if}
