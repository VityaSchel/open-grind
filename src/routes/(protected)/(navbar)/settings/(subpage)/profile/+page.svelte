<script lang="ts">
	import { getGenders } from "$lib/api/users/genders";
	import { getProfile } from "$lib/api/users/profiles";
	import { getPronouns } from "$lib/api/users/pronouns";
	import { getTags } from "$lib/api/users/tags";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import ProfileForm from "./ProfileForm.svelte";

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
	<div class="flex flex-col gap-3">
		{#each Array.from({ length: 7 })}
			<Skeleton class="h-12 w-full rounded-xl" />
		{/each}
	</div>
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
