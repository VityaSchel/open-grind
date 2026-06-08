<script lang="ts">
	import { getGenders, getProfile, getPronouns } from "$lib/api/users/profiles";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import ProfileForm from "./ProfileForm.svelte";

	const { data }: import("./$types").PageProps = $props();

	async function load(profileId: number) {
		const [profile, genders, pronouns] = await Promise.all([
			getProfile(profileId),
			getGenders().catch((error) => {
				console.error("Failed to load genders", error);
				return [];
			}),
			getPronouns().catch((error) => {
				console.error("Failed to load pronouns", error);
				return [];
			}),
		]);
		return { profile, genders, pronouns };
	}

	const loadPromise = $derived(load(data.ourProfileId));
</script>

{#await loadPromise}
	<div class="flex flex-col gap-3">
		{#each Array.from({ length: 7 })}
			<Skeleton class="h-12 w-full rounded-xl" />
		{/each}
	</div>
{:then { profile, genders, pronouns }}
	<ProfileForm
		{profile}
		{genders}
		{pronouns}
		ourProfileId={data.ourProfileId}
	/>
{:catch}
	<p class="text-destructive px-1 py-8 text-center">
		Failed to load your profile. Please try again.
	</p>
{/await}
