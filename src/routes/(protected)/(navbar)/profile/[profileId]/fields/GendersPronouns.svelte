<script lang="ts">
	import { getGenders } from "$lib/api/genders";
	import { fetchPronouns } from "$lib/api/pronouns";
	import Separator from "$lib/components/ui/separator/separator.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import ProfileField from "./ProfileField.svelte";

	let allGenders = $derived(getGenders());
	let allPronouns = $derived(fetchPronouns());

	let {
		genders = null,
		pronouns = null,
	}: {
		genders?: number[] | null;
		pronouns?: number[] | null;
	} = $props();
</script>

{#if (genders !== null && genders.length > 0) || (pronouns !== null && pronouns.length > 0)}
	<ProfileField>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			class="shrink-0"
		>
			<!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE -->
			<g
				fill="none"
				stroke="currentColor"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
			>
				<path
					d="M12 16v6m2-2h-4m8-18h4v4M2 2l7.17 7.17M2 5.355V2h3.357M22 2l-7.17 7.17M8 5L5 8"
				/>
				<circle cx="12" cy="12" r="4" />
			</g>
		</svg>
		{#if genders !== null && genders.length > 0}
			{#await allGenders}
				<Spinner />
			{:then allGenders}
				{genders
					.map(
						(genderId) =>
							allGenders.find((g) => g.genderId === genderId)?.gender,
					)
					.join(", ")}
			{:catch}
				<span class="load-fail">Failed to load genders</span>
			{/await}
		{/if}
		{#if genders !== null && genders.length > 0 && pronouns !== null && pronouns.length > 0}
			<Separator orientation="vertical" />
		{/if}
		{#if pronouns !== null && pronouns.length > 0}
			{#await allPronouns}
				<Spinner />
			{:then allPronouns}
				{pronouns
					.map(
						(pronounId) =>
							allPronouns.find((p) => p.pronounId === pronounId)?.pronoun,
					)
					.join(", ")}
			{:catch}
				<span class="load-fail">Failed to load pronouns</span>
			{/await}
		{/if}
	</ProfileField>
{/if}

<style lang="postcss">
	@reference "$layout";
	.load-fail {
		@apply italic text-muted-foreground;
	}
</style>
