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
		hivStatuses,
		lookingFor as lookingForLabels,
		meetAt as meetAtLabels,
		relationshipStatuses,
		tribes,
	} from "$lib/model/users/profiles";
	import AboutMe from "./AboutMe.svelte";
	import Distance from "./Distance.svelte";
	import FavoriteNoteButton from "./favorite-note/FavoriteNoteButton.svelte";
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
	import ProfileTopNavBar from "./top-nav/ProfileTopNavBar.svelte";

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
	{#if !ourProfile && profile.isFavorite && profileState.note}
		<FavoriteNoteButton
			profileId={profile.profileId}
			note={profileState.note}
			onSave={(note) => profileState.setNote(note)}
		/>
	{/if}
	<ProfileTopNavBar
		ourProfileId={profileState.ourProfileId}
		{profile}
		onBlocked={() => profileState.markBlocked()}
		onHidden={() => profileState.markHidden()}
		onFavorite={(isFavorite) => profileState.setFavorite(isFavorite)}
	/>
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
				<LastTested lastTestedDate={lastTestedDateValue} />
				<LookupField
					icon={HeartbeatIcon}
					label="Health Practices"
					value={sexualHealthValue}
					options={healthPracticeLabels}
				/>
			</ProfileSection>
		{/if}
		{#if socialNetworks && Object.keys(socialNetworks).length > 0}
			<ProfileSection title="Socials">
				<Socials socials={socialNetworks} />
			</ProfileSection>
		{/if}
	</div>
{/if}
