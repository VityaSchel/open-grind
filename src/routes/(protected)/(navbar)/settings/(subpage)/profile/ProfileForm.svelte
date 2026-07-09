<script lang="ts">
	import isEqual from "lodash-es/isEqual";
	import {
		FacebookLogoIcon,
		InstagramLogoIcon,
		XLogoIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { expoOut } from "svelte/easing";
	import { fly } from "svelte/transition";

	import { showErrorToast } from "$lib/api/error";
	import {
		deleteProfilePhotos,
		ProfileModerationError,
		type ProfileUpdate,
		updateOwnProfile,
	} from "$lib/api/users/profiles";
	import { Button } from "$lib/components/ui/button";
	import { WheelPicker } from "$lib/components/ui/carousel";
	import { Spinner } from "$lib/components/ui/spinner";
	import {
		acceptNSFWPics,
		bodyTypes,
		ethnicities,
		type Gender,
		healthPractices,
		hivStatuses,
		lookingFor as lookingForLabels,
		meetAt as meetAtLabels,
		type Profile,
		type Pronoun,
		relationshipStatuses,
		sexualPositions,
		tribes,
		vaccines as vaccineLabels,
	} from "$lib/model/users/profiles";
	import ComboField from "./fields/ComboField.svelte";
	import DateField from "./fields/DateField.svelte";
	import Field from "./fields/Field.svelte";
	import MultilineField from "./fields/MultilineField.svelte";
	import MultiSelectField from "./fields/MultiSelectField.svelte";
	import NumberField from "./fields/NumberField.svelte";
	import SelectField from "./fields/SelectField.svelte";
	import SocialField from "./fields/SocialField.svelte";
	import SwitchRow from "./fields/SwitchRow.svelte";
	import TextField from "./fields/TextField.svelte";
	import {
		ageRange,
		fieldLimits,
		heightCmRange,
		optionsFromMap,
		weightKgRange,
	} from "./options";
	import ProfilePicturesUpload from "./ProfilePicturesUpload.svelte";

	let {
		profile,
		genders,
		pronouns,
		ourProfileId,
	}: {
		profile: Profile;
		genders: Gender[];
		pronouns: Pronoun[];
		ourProfileId: number;
	} = $props();

	const ethnicityOptions = optionsFromMap(ethnicities);
	const relationshipOptions = optionsFromMap(relationshipStatuses);
	const bodyTypeOptions = optionsFromMap(bodyTypes);
	const hivOptions = optionsFromMap(hivStatuses);
	const positionOptions = optionsFromMap(sexualPositions);
	const nsfwOptions = optionsFromMap(acceptNSFWPics);
	const lookingForOptions = optionsFromMap(lookingForLabels);
	const tribeOptions = optionsFromMap(tribes);
	const meetAtOptions = optionsFromMap(meetAtLabels);
	const vaccineOptions = optionsFromMap(vaccineLabels);
	const healthOptions = optionsFromMap(healthPractices);

	const genderById = untrack(
		() => new Map(genders.map((gender) => [gender.genderId, gender])),
	);
	const genderOptions = untrack(() =>
		genders
			.filter((gender) => gender.sortProfile != null)
			.sort((a, b) => (a.sortProfile ?? 0) - (b.sortProfile ?? 0))
			.map((gender) => ({ value: gender.genderId, label: gender.gender })),
	);
	const resolveGenderLabel = (id: number) => genderById.get(id)?.gender;
	const genderExclusions = (id: number) =>
		genderById.get(id)?.excludeOnProfileSelection ?? [];

	const pronounById = untrack(
		() => new Map(pronouns.map((pronoun) => [pronoun.pronounId, pronoun])),
	);
	const pronounOptions = untrack(() =>
		pronouns.map((pronoun) => ({
			value: pronoun.pronounId,
			label: pronoun.pronoun,
		})),
	);
	const resolvePronounLabel = (id: number) => pronounById.get(id)?.pronoun;

	const initial = untrack(() => $state.snapshot(profile));

	let displayName = $state(initial.displayName ?? "");
	let aboutMe = $state(initial.aboutMe ?? "");

	let genderIds = $state<number[]>([...(initial.genders ?? [])]);
	let pronounIds = $state<number[]>([...(initial.pronouns ?? [])]);

	let age = $state(initial.age ?? ageRange.min);
	let showAge = $state(initial.showAge);
	let sexualPosition = $state<number | null>(initial.sexualPosition ?? null);
	let showPosition = $state(initial.showPosition);
	let height = $state<number | null>(initial.height);
	let weightKg = $state<number | null>(
		initial.weight === null ? null : Math.round(initial.weight / 100) / 10,
	);
	let bodyType = $state<number | null>(initial.bodyType);
	let ethnicity = $state<number | null>(initial.ethnicity);
	let relationshipStatus = $state<number | null>(initial.relationshipStatus);

	let showTribes = $state(initial.showTribes);
	let grindrTribes = $state<number[]>([...initial.grindrTribes]);
	let tribesImInto = $state<number[]>([...(initial.tribesImInto ?? [])]);
	let lookingFor = $state<number[]>([...initial.lookingFor]);
	let meetAt = $state<number[]>([...(initial.meetAt ?? [])]);
	let nsfw = $state<number | null>(initial.nsfw);

	let hivStatus = $state<number | null>(initial.hivStatus);
	let lastTestedDate = $state<number | null>(initial.lastTestedDate);
	let sexualHealth = $state<number[]>([...initial.sexualHealth]);
	let vaccineIds = $state<number[]>([...(initial.vaccines ?? [])]);

	let instagram = $state(initial.socialNetworks.instagram?.userId ?? null);
	let twitter = $state(initial.socialNetworks.twitter?.userId ?? null);
	let facebook = $state(initial.socialNetworks.facebook?.userId ?? null);

	let medias = $state(
		initial.medias.map((media) => ({ mediaHash: media.mediaHash })),
	);

	let saving = $state(false);
	const aboutMeOverLimit = $derived(aboutMe.length > fieldLimits.aboutMe);

	function formSnapshot() {
		return {
			displayName,
			aboutMe,
			genderIds: [...genderIds],
			pronounIds: [...pronounIds],
			age,
			showAge,
			sexualPosition,
			showPosition,
			height,
			weightKg,
			bodyType,
			ethnicity,
			relationshipStatus,
			showTribes,
			grindrTribes: [...grindrTribes],
			tribesImInto: [...tribesImInto],
			lookingFor: [...lookingFor],
			meetAt: [...meetAt],
			nsfw,
			hivStatus,
			lastTestedDate,
			sexualHealth: [...sexualHealth],
			vaccineIds: [...vaccineIds],
			instagram,
			twitter,
			facebook,
			mediaHashes: medias.map((media) => media.mediaHash),
		};
	}

	let savedForm = $state(formSnapshot());
	const dirty = $derived(!isEqual(formSnapshot(), savedForm));

	async function save() {
		if (saving || aboutMeOverLimit || !dirty) return;
		saving = true;
		const body = {
			displayName: displayName.trim() || null,
			aboutMe: aboutMe.trim() || null,
			genders: genderIds,
			pronouns: pronounIds,
			age,
			showAge,
			sexualPosition,
			showPosition,
			height,
			weight: weightKg === null ? null : Math.round(weightKg * 1000),
			bodyType,
			ethnicity,
			relationshipStatus,
			showTribes,
			grindrTribes,
			tribesImInto,
			lookingFor,
			meetAt,
			nsfw,
			hivStatus,
			lastTestedDate,
			sexualHealth,
			vaccines: vaccineIds,
			socialNetworks: {
				instagram: instagram ? { userId: instagram } : undefined,
				twitter: twitter ? { userId: twitter } : undefined,
				facebook: facebook ? { userId: facebook } : undefined,
			},
			approximateDistance: initial.approximateDistance,
			showDistance: initial.showDistance,
			profileTags: initial.profileTags,
		} as ProfileUpdate;
		const currentHashes = new Set(medias.map((media) => media.mediaHash));
		const removedHashes = savedForm.mediaHashes.filter(
			(hash) => !currentHashes.has(hash),
		);
		try {
			await Promise.all([
				updateOwnProfile(ourProfileId, body),
				deleteProfilePhotos(ourProfileId, removedHashes),
			]);
			savedForm = formSnapshot();
			toast.success("Profile updated");
		} catch (error) {
			if (error instanceof ProfileModerationError) {
				const detail = error.rejected
					.map((r) => `${r.field}: ${r.terms.join(", ")}`)
					.join("; ");
				toast.error("Couldn't save — these terms aren't allowed", {
					description: detail || undefined,
				});
			} else {
				showErrorToast({ label: "Failed to update profile", error });
			}
		} finally {
			saving = false;
		}
	}
</script>

<form class="flex flex-col gap-6" onsubmit={(event) => event.preventDefault()}>
	<section class="flex flex-col gap-3">
		<h2>Photos</h2>
		<ProfilePicturesUpload bind:medias />
	</section>

	<section class="flex flex-col gap-3">
		<TextField
			label="Display name"
			bind:value={displayName}
			maxLength={fieldLimits.displayName}
			placeholder="Everyone will see this on the grid..."
		/>
		<MultilineField
			label="About me"
			bind:value={aboutMe}
			maxLength={fieldLimits.aboutMe}
			placeholder="Tell people who you are and what you're looking for (not what you're not looking for)"
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h2>Identity</h2>
		<ComboField
			label="Gender"
			bind:values={genderIds}
			options={genderOptions}
			resolveLabel={resolveGenderLabel}
			exclude={genderExclusions}
			searchPlaceholder="Search genders..."
			hint="Type to search"
		/>
		<ComboField
			label="Pronouns"
			bind:values={pronounIds}
			options={pronounOptions}
			resolveLabel={resolvePronounLabel}
			searchPlaceholder="Search pronouns..."
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h2>Stats</h2>
		<Field label="Age">
			<WheelPicker
				bind:value={age}
				min={ageRange.min}
				max={ageRange.max}
				label="years"
			/>
		</Field>
		<SwitchRow label="Show my age" bind:checked={showAge} />
		<SelectField
			label="Position"
			bind:value={sexualPosition}
			options={positionOptions}
		/>
		<SwitchRow label="Show my position" bind:checked={showPosition} />
		<NumberField
			label="Height"
			bind:value={height}
			min={heightCmRange.min}
			max={heightCmRange.max}
			unit="cm"
			placeholder="—"
		/>
		<NumberField
			label="Weight"
			bind:value={weightKg}
			min={weightKgRange.min}
			max={weightKgRange.max}
			step={0.5}
			unit="kg"
			placeholder="—"
		/>
		<SelectField
			label="Body type"
			bind:value={bodyType}
			options={bodyTypeOptions}
		/>
		<SelectField
			label="Ethnicity"
			bind:value={ethnicity}
			options={ethnicityOptions}
		/>
		<SelectField
			label="Relationship status"
			bind:value={relationshipStatus}
			options={relationshipOptions}
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h2>Preferences</h2>
		<SwitchRow label="Show my tribes" bind:checked={showTribes} />
		<MultiSelectField
			label="My tribes"
			bind:values={grindrTribes}
			options={tribeOptions}
		/>
		<MultiSelectField
			label="Tribes I'm into"
			bind:values={tribesImInto}
			options={tribeOptions}
		/>
		<MultiSelectField
			label="Looking for"
			bind:values={lookingFor}
			options={lookingForOptions}
		/>
		<MultiSelectField
			label="Meet at"
			bind:values={meetAt}
			options={meetAtOptions}
		/>
		<SelectField
			label="Accept NSFW pics"
			bind:value={nsfw}
			options={nsfwOptions}
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h2>Health</h2>
		<SelectField
			label="HIV status"
			bind:value={hivStatus}
			options={hivOptions}
		/>
		<DateField label="Last tested" bind:value={lastTestedDate} />
		<MultiSelectField
			label="Sexual health practices"
			bind:values={sexualHealth}
			options={healthOptions}
		/>
		<MultiSelectField
			label="Vaccines"
			bind:values={vaccineIds}
			options={vaccineOptions}
		/>
	</section>

	<section class="flex flex-col gap-3">
		<h2>Social</h2>
		<SocialField
			label="Instagram"
			bind:value={instagram}
			icon={InstagramLogoIcon}
		/>
		<SocialField label="X" bind:value={twitter} icon={XLogoIcon} />
		<SocialField
			label="Facebook"
			bind:value={facebook}
			icon={FacebookLogoIcon}
		/>
	</section>

	{#if dirty}
		<div
			class="sticky bottom-(--content-pb) z-10 -mx-4 px-4 py-3"
			transition:fly={{ y: 80, duration: 300, easing: expoOut }}
		>
			<Button
				type="submit"
				size="lg"
				class="h-12 w-full text-base"
				disabled={saving || aboutMeOverLimit}
				onclick={() => save()}
			>
				{#if saving}
					<Spinner class="size-5" />
				{/if}
				Save changes
			</Button>
		</div>
	{/if}
</form>

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply ps-1 text-xl font-semibold tracking-tight truncate;
	}
</style>
