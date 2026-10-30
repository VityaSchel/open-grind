<script lang="ts">
	import { format } from "date-fns";
	import ClockIcon from "phosphor-svelte/lib/ClockIcon";

	import { isHalloween } from "$lib/components/halloween/halloween";
	import SandsOfTimeIcon from "$lib/components/halloween/SandsOfTimeIcon.svelte";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let { lastTestedDate }: { lastTestedDate: number | null } = $props();
</script>

{#if lastTestedDate !== null}
	<ProfileField>
		{#if isHalloween()}
			<SandsOfTimeIcon class="shrink-0" />
		{:else}
			<ClockIcon class="shrink-0" />
		{/if}
		<ProfileValueLabel label="Last Tested">
			{format(new Date(lastTestedDate), "LLLL yyyy")}
		</ProfileValueLabel>
	</ProfileField>
{/if}
