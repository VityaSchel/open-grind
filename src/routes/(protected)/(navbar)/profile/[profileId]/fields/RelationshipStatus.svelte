<script lang="ts">
	import { UsersIcon } from "phosphor-svelte";

	import {
		relationshipStatuses,
		type RelationshipStatusId,
	} from "$lib/model/profile";
	import ProfileField from "./ProfileField.svelte";

	let {
		relationshipStatus,
	}: {
		relationshipStatus: RelationshipStatusId | null;
	} = $props();
</script>

{#if relationshipStatus !== null}
	<ProfileField>
		<UsersIcon class="shrink-0" />
		{relationshipStatuses[relationshipStatus]}
	</ProfileField>
{/if}
