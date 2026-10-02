<script lang="ts">
	import { getGenders } from "$lib/api/users/genders";
	import { getProfile } from "$lib/api/users/profiles";
	import { getPronouns } from "$lib/api/users/pronouns";
	import { getTags } from "$lib/api/users/tags";
	import ProfileForm from "./ProfileForm.svelte";
	import ProfileFormSkeleton from "./ProfileFormSkeleton.svelte";

	const { data }: import("./$types").PageProps = $props();

	async function load(profileId: number) {
		const [profile, genders, pronouns, tags] = await Promise.all([
			getProfile(profileId),
			getGenders().catch((error) => {
				console.error("Failed to load genders", error);
				return [];
			}),
			getPronouns().catch((error) => {
				console.error("Failed to load pronouns", error);
				return [];
			}),
			getTags().catch((error) => {
				console.error("Failed to load tags", error);
				return [];
			}),
		]);
		return { profile, genders, pronouns, tags };
	}

	const loadPromise = $derived(load(data.ourProfileId));
</script>

{#await loadPromise}
	<ProfileFormSkeleton />
{:then { profile, genders, pronouns, tags }}
	<ProfileForm
		{profile}
		{genders}
		{pronouns}
		{tags}
		ourProfileId={data.ourProfileId}
	/>
{:catch}
	<p class="px-1 py-8 text-center text-destructive">
		Failed to load your profile. Please try again.
	</p>
{/await}
