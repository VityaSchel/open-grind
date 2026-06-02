<script lang="ts">
	import { format } from "date-fns";
	import { ClockIcon } from "phosphor-svelte";

	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let {
		lastTestedDate,
	}: {
		lastTestedDate: number | null;
	} = $props();
</script>

{#if lastTestedDate !== null}
	<ProfileField>
		<ClockIcon class="shrink-0" />
		<ProfileValueLabel label="Last Tested">
			{format(new Date(lastTestedDate), "LLLL yyyy")}
		</ProfileValueLabel>
	</ProfileField>
{/if}
