<script lang="ts">
	import { ClockIcon } from "phosphor-svelte";

	import { t } from "$lib/i18n";
	import { formatDate } from "$lib/i18n/format";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let { lastTestedDate }: { lastTestedDate: number | null } = $props();
</script>

{#if lastTestedDate !== null}
	<ProfileField>
		<ClockIcon class="shrink-0" />
		<ProfileValueLabel label={t("profile.fields.lastTested")}>
			{formatDate({ date: lastTestedDate, preset: "monthYear" })}
		</ProfileValueLabel>
	</ProfileField>
{/if}
