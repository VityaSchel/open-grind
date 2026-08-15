<script lang="ts">
	import {
		FacebookLogoIcon,
		InstagramLogoIcon,
		XLogoIcon,
	} from "phosphor-svelte";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { expoOut } from "svelte/easing";
	import { fly } from "svelte/transition";

	import { showErrorToast } from "$lib/api/error-toast";
	import { ProfileModerationError } from "$lib/api/users/profile-moderation";
	import {
		deleteProfilePhotos,
		type ProfileUpdate,
		updateOwnProfile,
	} from "$lib/api/users/profiles";
	import { Button } from "$lib/components/ui/button";
	import { WheelPicker } from "$lib/components/ui/carousel";
	import { Spinner } from "$lib/components/ui/spinner";
	import { type Profile } from "$lib/model/users/profiles";
	import { deepEqual } from "$lib/util/deep-equal";
	import type { Gender } from "$lib/model/users/genders";
	import type { Pronoun } from "$lib/model/users/pronouns";
	import type { ProfileTagsResponse } from "$lib/model/users/tags";
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
		bodyTypeOptions,
		buildGenderOptions,
		buildPronounOptions,
		buildTagOptions,
		ethnicityOptions,
		fieldLimits,
		healthOptions,
		heightCmRange,
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
		weightKgRange,
	} from "./options";
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
		buildTagOptions(tags),
	);

	const initial = untrack(() => $state.snapshot(profile));

	let form = $state({
		displayName: initial.displayName ?? "",
		aboutMe: initial.aboutMe ?? "",
		profileTags: [...initial.profileTags],
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
		grindrTribes: [...initial.grindrTribes],
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
		medias: initial.medias.map((media) => ({ mediaHash: media.mediaHash })),
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
		const currentHashes = new Set(
			sent.medias.map((media) => media.mediaHash),
		);
		const removedHashes = savedForm.medias
			.map((media) => media.mediaHash)
			.filter((hash) => !currentHashes.has(hash));
		try {
			await Promise.all([
				updateOwnProfile({
					cacheProfileId: ourProfileId,
					profile: body,
				}),
				deleteProfilePhotos({
					cacheProfileId: ourProfileId,
					mediaHashes: removedHashes,
				}),
			]);
			savedForm = sent;
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
	<fieldset disabled={saving} class="contents">
		<section class="flex flex-col gap-3">
			<h2>Photos</h2>
			<ProfilePicturesUpload bind:medias={form.medias} />
		</section>

		<section class="flex flex-col gap-3">
			<TextField
				label="Display name"
				bind:value={form.displayName}
				maxLength={fieldLimits.displayName}
				placeholder="Everyone will see this on the grid..."
			/>
			<MultilineField
				label="About me"
				bind:value={form.aboutMe}
				maxLength={fieldLimits.aboutMe}
				placeholder="Tell people who you are and what you're looking for (not what you're not looking for)"
			/>
			<ComboField
				label="Tags"
				bind:values={form.profileTags}
				options={tagOptions}
				resolveLabel={resolveTagLabel}
				max={maxProfileTags}
				searchPlaceholder="Search tags..."
			/>
		</section>

		<section class="flex flex-col gap-3">
			<h2>Identity</h2>
			<ComboField
				label="Gender"
				bind:values={form.genderIds}
				options={genderOptions}
				resolveLabel={resolveGenderLabel}
				exclude={genderExclusions}
				max={maxProfileGenders}
				searchPlaceholder="Search genders..."
			/>
			<ComboField
				label="Pronouns"
				bind:values={form.pronounIds}
				options={pronounOptions}
				resolveLabel={resolvePronounLabel}
				max={maxProfilePronouns}
				searchPlaceholder="Search pronouns..."
			/>
		</section>

		<section class="flex flex-col gap-3">
			<h2>Stats</h2>
			<Field label="Age">
				<WheelPicker
					bind:value={form.age}
					min={ageRange.min}
					max={ageRange.max}
					label="years"
					disabled={saving}
				/>
			</Field>
			<SwitchRow label="Show my age" bind:checked={form.showAge} />
			<SelectField
				label="Position"
				bind:value={form.sexualPosition}
				options={positionOptions}
			/>
			<SwitchRow
				label="Show my position"
				bind:checked={form.showPosition}
			/>
			<NumberField
				label="Height"
				bind:value={form.height}
				min={heightCmRange.min}
				max={heightCmRange.max}
				unit="cm"
				placeholder="—"
			/>
			<NumberField
				label="Weight"
				bind:value={form.weightKg}
				min={weightKgRange.min}
				max={weightKgRange.max}
				step={0.5}
				unit="kg"
				placeholder="—"
			/>
			<SelectField
				label="Body type"
				bind:value={form.bodyType}
				options={bodyTypeOptions}
			/>
			<SelectField
				label="Ethnicity"
				bind:value={form.ethnicity}
				options={ethnicityOptions}
			/>
			<SelectField
				label="Relationship status"
				bind:value={form.relationshipStatus}
				options={relationshipOptions}
			/>
		</section>

		<section class="flex flex-col gap-3">
			<h2>Preferences</h2>
			<SwitchRow label="Show my tribes" bind:checked={form.showTribes} />
			<MultiSelectField
				label="My tribes"
				bind:values={form.grindrTribes}
				options={tribeOptions}
			/>
			<MultiSelectField
				label="Tribes I'm into"
				bind:values={form.tribesImInto}
				options={tribeOptions}
			/>
			<MultiSelectField
				label="Looking for"
				bind:values={form.lookingFor}
				options={lookingForOptions}
			/>
			<MultiSelectField
				label="Meet at"
				bind:values={form.meetAt}
				options={meetAtOptions}
			/>
			<SelectField
				label="Accept NSFW pics"
				bind:value={form.nsfw}
				options={nsfwOptions}
			/>
		</section>

		<section class="flex flex-col gap-3">
			<h2>Health</h2>
			<SelectField
				label="HIV status"
				bind:value={form.hivStatus}
				options={hivOptions}
			/>
			<DateField label="Last tested" bind:value={form.lastTestedDate} />
			<MultiSelectField
				label="Sexual health practices"
				bind:values={form.sexualHealth}
				options={healthOptions}
			/>
			<MultiSelectField
				label="Vaccines"
				bind:values={form.vaccineIds}
				options={vaccineOptions}
			/>
		</section>

		<section class="flex flex-col gap-3">
			<h2>Social</h2>
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
		</section>
	</fieldset>

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
		@apply truncate ps-1 text-xl font-semibold tracking-tight;
	}
</style>
