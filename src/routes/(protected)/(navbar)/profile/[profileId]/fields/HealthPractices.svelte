<script lang="ts">
	import { HeartbeatIcon } from "phosphor-svelte";

	import {
		type HealthPracticeId,
		healthPractices as healthPracticesOptions,
	} from "$lib/model/profile";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let {
		healthPractices = null,
	}: {
		healthPractices?: HealthPracticeId[] | null;
	} = $props();
</script>

{#if healthPractices !== null && healthPractices.length > 0}
	<ProfileField>
		<HeartbeatIcon class="shrink-0" />
		<ProfileValueLabel label="Health Practices">
			{healthPractices
				.map((option) => healthPracticesOptions[option])
				.join(", ")}
		</ProfileValueLabel>
	</ProfileField>
{/if}
