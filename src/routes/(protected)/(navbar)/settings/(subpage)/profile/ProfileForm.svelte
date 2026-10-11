<script lang="ts">
	import {
		FacebookLogoIcon,
		InstagramLogoIcon,
		XLogoIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		isTagKeyOfferedNow,
		isTribeOfferedNow,
	} from "$lib/api/feature-flags-state.svelte";
	import { ProfileModerationError } from "$lib/api/users/profile-moderation";
	import {
		type ProfileUpdate,
		updateOwnProfile,
	} from "$lib/api/users/profiles";
	import Field from "$lib/components/fields/Field.svelte";
	import MultilineField from "$lib/components/fields/MultilineField.svelte";
	import TextField from "$lib/components/fields/TextField.svelte";
	import SaveChangesBar from "$lib/components/shared/SaveChangesBar.svelte";
	import { WheelPicker } from "$lib/components/ui/carousel";
	import { t } from "$lib/i18n";
	import {
		type Profile,
		PROFILE_PHOTO_AWAITING_REVIEW,
	} from "$lib/model/users/profiles";
	import { deepEqual } from "$lib/util/deep-equal";
	import type { Gender } from "$lib/model/users/genders";
	import type { Pronoun } from "$lib/model/users/pronouns";
	import type { ProfileTagsResponse } from "$lib/model/users/tags";
	import ComboField from "./fields/ComboField.svelte";
	import DateField from "./fields/DateField.svelte";
	import FieldPair from "./fields/FieldPair.svelte";
	import HeightField from "./fields/HeightField.svelte";
	import MultiSelectField from "./fields/MultiSelectField.svelte";
	import SelectField from "./fields/SelectField.svelte";
	import SocialField from "./fields/SocialField.svelte";
	import SwitchRow from "./fields/SwitchRow.svelte";
	import WeightField from "./fields/WeightField.svelte";
	import {
		ageRange,
		bodyTypeOptions,
		buildGenderOptions,
		buildPronounOptions,
		buildTagOptions,
		ethnicityOptions,
		fieldLimits,
		healthOptions,
		hivOptions,
		lookingForOptions,
		maxProfileGenders,
		maxProfilePronouns,
		maxProfileTags,
		meetAtOptions,
		nsfwOptions,
		positionOptions,
		relationshipOptions,
		tribeOptions,
		vaccineOptions,
	} from "./options";
	import { saveProfilePhotoOrder } from "./profile-photo-order";
	import ProfileFormSection from "./ProfileFormSection.svelte";
	import ProfilePicturesUpload from "./ProfilePicturesUpload.svelte";

	let {
		profile,
		genders,
		pronouns,
		tags,
		ourProfileId,
	}: {
		profile: Profile;
		genders: Gender[];
		pronouns: Pronoun[];
		tags: ProfileTagsResponse;
		ourProfileId: number;
	} = $props();

	const {
		options: genderOptions,
		resolveLabel: resolveGenderLabel,
		exclusions: genderExclusions,
	} = untrack(() => buildGenderOptions(genders));
	const { options: pronounOptions, resolveLabel: resolvePronounLabel } =
		untrack(() => buildPronounOptions(pronouns));
	const { options: tagOptions, resolveLabel: resolveTagLabel } = untrack(() =>
		buildTagOptions({ tags, isOffered: isTagKeyOfferedNow }),
	);

	const initial = untrack(() => $state.snapshot(profile));

	let form = $state({
		displayName: initial.displayName ?? "",
		aboutMe: initial.aboutMe ?? "",
		profileTags: initial.profileTags.filter(isTagKeyOfferedNow),
		genderIds: [...(initial.genders ?? [])],
		pronounIds: [...(initial.pronouns ?? [])],
		age: initial.age ?? ageRange.min,
		showAge: initial.showAge,
		sexualPosition: initial.sexualPosition ?? null,
		showPosition: initial.showPosition,
		height: initial.height,
		weightKg:
			initial.weight === null
				? null
				: Math.round(initial.weight / 100) / 10,
		bodyType: initial.bodyType,
		ethnicity: initial.ethnicity,
		relationshipStatus: initial.relationshipStatus,
		showTribes: initial.showTribes,
		grindrTribes: initial.grindrTribes.filter(isTribeOfferedNow),
		tribesImInto: [...(initial.tribesImInto ?? [])],
		lookingFor: [...initial.lookingFor],
		meetAt: [...(initial.meetAt ?? [])],
		nsfw: initial.nsfw,
		hivStatus: initial.hivStatus,
		lastTestedDate: initial.lastTestedDate,
		sexualHealth: [...initial.sexualHealth],
		vaccineIds: [...(initial.vaccines ?? [])],
		instagram: initial.socialNetworks.instagram?.userId ?? null,
		twitter: initial.socialNetworks.twitter?.userId ?? null,
		facebook: initial.socialNetworks.facebook?.userId ?? null,
		medias: initial.medias.map((media) => ({
			mediaHash: media.mediaHash,
			pending: media.state === PROFILE_PHOTO_AWAITING_REVIEW,
		})),
		removedPhotos: [] as string[],
	});

	let saving = $state(false);
	const aboutMeOverLimit = $derived(
		form.aboutMe.length > fieldLimits.aboutMe,
	);

	let savedForm = $state.raw($state.snapshot(form));
	const dirty = $derived(!deepEqual($state.snapshot(form), savedForm));

	async function save() {
		if (saving || aboutMeOverLimit || !dirty) return;
		saving = true;
		const sent = $state.snapshot(form);
		const body = {
			displayName: sent.displayName.trim() || null,
			aboutMe: sent.aboutMe.trim() || null,
			genders: sent.genderIds,
			pronouns: sent.pronounIds,
			age: sent.age,
			showAge: sent.showAge,
			sexualPosition: sent.sexualPosition,
			showPosition: sent.showPosition,
			height: sent.height,
			weight:
				sent.weightKg === null
					? null
					: Math.round(sent.weightKg * 1000),
			bodyType: sent.bodyType,
			ethnicity: sent.ethnicity,
			relationshipStatus: sent.relationshipStatus,
			showTribes: sent.showTribes,
			grindrTribes: sent.grindrTribes,
			tribesImInto: sent.tribesImInto,
			lookingFor: sent.lookingFor,
			meetAt: sent.meetAt,
			nsfw: sent.nsfw,
			hivStatus: sent.hivStatus,
			lastTestedDate: sent.lastTestedDate,
			sexualHealth: sent.sexualHealth,
			vaccines: sent.vaccineIds,
			socialNetworks: {
				instagram: sent.instagram
					? { userId: sent.instagram }
					: undefined,
				twitter: sent.twitter ? { userId: sent.twitter } : undefined,
				facebook: sent.facebook ? { userId: sent.facebook } : undefined,
			},
			approximateDistance: initial.approximateDistance,
			showDistance: initial.showDistance,
			profileTags: sent.profileTags,
		} satisfies ProfileUpdate;
		const removedPhotos = new Set(sent.removedPhotos);
		const keptPhotos = sent.medias.filter(
			(media) => !removedPhotos.has(media.mediaHash),
		);
		try {
			await Promise.all([
				updateOwnProfile({
					cacheProfileId: ourProfileId,
					profile: body,
				}),
				saveProfilePhotoOrder({
					cacheProfileId: ourProfileId,
					saved: savedForm.medias.map((media) => media.mediaHash),
					kept: keptPhotos.map((media) => media.mediaHash),
				}),
			]);
			form.medias = form.medias.filter(
				(media) => !removedPhotos.has(media.mediaHash),
			);
			form.removedPhotos = [];
			savedForm = { ...sent, medias: keptPhotos, removedPhotos: [] };
			toast.success(t("settings.profile.saved"));
		} catch (error) {
			if (error instanceof ProfileModerationError) {
				const detail = error.rejected
					.map((r) => `${r.field}: ${r.terms.join(", ")}`)
					.join("; ");
				toast.error(t("settings.profile.errors.bannedTerms"), {
					description: detail || undefined,
				});
			} else {
				showErrorToast({
					label: t("settings.profile.errors.saveFailed"),
					error,
				});
			}
		} finally {
			saving = false;
		}
	}
</script>

<form
	data-slot="profile-form"
	class="flex grow flex-col gap-6"
	onsubmit={(event) => event.preventDefault()}
>
	<fieldset disabled={saving} class="contents">
		<ProfileFormSection title={t("settings.profile.sections.photos")}>
			<ProfilePicturesUpload
				bind:medias={form.medias}
				bind:removed={form.removedPhotos}
				{ourProfileId}
				disabled={saving}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("settings.profile.sections.basics")}>
			<TextField
				label={t("settings.profile.fields.displayName")}
				bind:value={form.displayName}
				maxLength={fieldLimits.displayName}
				placeholder={t("settings.profile.placeholders.displayName")}
			/>
			<FieldPair>
				<Field label={t("settings.profile.fields.age")}>
					{#snippet picker({ labelId })}
						<WheelPicker
							bind:value={form.age}
							min={ageRange.min}
							max={ageRange.max}
							unit={t("settings.profile.age.unit", {
								count: form.age,
							})}
							valueText={(age) =>
								t("settings.profile.age.a11y.value", {
									count: age,
								})}
							disabled={saving}
							aria-labelledby={labelId}
						/>
					{/snippet}
				</Field>
				<SwitchRow
					label={t("settings.profile.fields.showAge")}
					bind:checked={form.showAge}
				/>
			</FieldPair>
			<FieldPair>
				<SelectField
					label={t("settings.profile.fields.position")}
					bind:value={form.sexualPosition}
					options={positionOptions}
				/>
				<SwitchRow
					label={t("settings.profile.fields.showPosition")}
					bind:checked={form.showPosition}
				/>
			</FieldPair>
			<HeightField bind:value={form.height} />
			<WeightField bind:value={form.weightKg} />
			<SelectField
				label={t("settings.profile.fields.bodyType")}
				bind:value={form.bodyType}
				options={bodyTypeOptions}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("settings.profile.sections.about")}>
			<ComboField
				label={t("settings.profile.fields.tags")}
				bind:values={form.profileTags}
				options={tagOptions}
				resolveLabel={resolveTagLabel}
				max={maxProfileTags}
				searchPlaceholder={t("common.tags.searchPlaceholder")}
			/>
			<MultilineField
				label={t("settings.profile.fields.aboutMe")}
				bind:value={form.aboutMe}
				maxLength={fieldLimits.aboutMe}
				placeholder={t("settings.profile.placeholders.aboutMe")}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("common.profileSections.stats")}>
			<ComboField
				label={t("settings.profile.fields.gender")}
				bind:values={form.genderIds}
				options={genderOptions}
				resolveLabel={resolveGenderLabel}
				exclude={genderExclusions}
				max={maxProfileGenders}
				searchPlaceholder={t(
					"settings.profile.placeholders.searchGenders",
				)}
			/>
			<ComboField
				label={t("settings.profile.fields.pronouns")}
				bind:values={form.pronounIds}
				options={pronounOptions}
				resolveLabel={resolvePronounLabel}
				max={maxProfilePronouns}
				searchPlaceholder={t(
					"settings.profile.placeholders.searchPronouns",
				)}
			/>
			<FieldPair>
				<MultiSelectField
					label={t("settings.profile.fields.myTribes")}
					bind:values={form.grindrTribes}
					options={tribeOptions}
				/>
				<SwitchRow
					label={t("settings.profile.fields.showTribes")}
					bind:checked={form.showTribes}
				/>
			</FieldPair>
			<SelectField
				label={t("settings.profile.fields.ethnicity")}
				bind:value={form.ethnicity}
				options={ethnicityOptions}
			/>
			<SelectField
				label={t("settings.profile.fields.relationshipStatus")}
				bind:value={form.relationshipStatus}
				options={relationshipOptions}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("common.profileSections.expectations")}>
			<MultiSelectField
				label={t("settings.profile.fields.lookingFor")}
				bind:values={form.lookingFor}
				options={lookingForOptions}
			/>
			<MultiSelectField
				label={t("settings.profile.fields.meetAt")}
				bind:values={form.meetAt}
				options={meetAtOptions}
			/>
			<SelectField
				label={t("settings.profile.fields.acceptNsfwPics")}
				bind:value={form.nsfw}
				options={nsfwOptions}
			/>
			<MultiSelectField
				label={t("settings.profile.fields.tribesImInto")}
				bind:values={form.tribesImInto}
				options={tribeOptions}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("common.profileSections.health")}>
			<SelectField
				label={t("settings.profile.fields.hivStatus")}
				bind:value={form.hivStatus}
				options={hivOptions}
			/>
			<DateField
				label={t("settings.profile.fields.lastTested")}
				bind:value={form.lastTestedDate}
			/>
			<MultiSelectField
				label={t("settings.profile.fields.sexualHealthPractices")}
				bind:values={form.sexualHealth}
				options={healthOptions}
			/>
			<MultiSelectField
				label={t("settings.profile.fields.vaccines")}
				bind:values={form.vaccineIds}
				options={vaccineOptions}
			/>
		</ProfileFormSection>

		<ProfileFormSection title={t("common.profileSections.socials")}>
			<SocialField
				label="Instagram"
				bind:value={form.instagram}
				icon={InstagramLogoIcon}
			/>
			<SocialField label="X" bind:value={form.twitter} icon={XLogoIcon} />
			<SocialField
				label="Facebook"
				bind:value={form.facebook}
				icon={FacebookLogoIcon}
			/>
		</ProfileFormSection>
	</fieldset>

	{#if dirty}
		<SaveChangesBar
			type="submit"
			{saving}
			disabled={aboutMeOverLimit}
			onclick={() => void save()}
		/>
	{/if}
</form>
