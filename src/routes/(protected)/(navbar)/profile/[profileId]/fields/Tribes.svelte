<script lang="ts">
	import { UsersThreeIcon } from "phosphor-svelte";

	import { tribes as allTribes, type TribeId } from "$lib/model/profile";
	import ProfileField from "./ProfileField.svelte";

	let {
		tribes,
	}: {
		tribes: TribeId[] | null;
	} = $props();
</script>

{#if tribes !== null && tribes.length > 0}
	<ProfileField>
		<UsersThreeIcon class="shrink-0" />
		{tribes.map((tribe) => allTribes[tribe]).join(", ")}
	</ProfileField>
{/if}
