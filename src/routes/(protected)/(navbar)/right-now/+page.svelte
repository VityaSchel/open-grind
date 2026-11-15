<script lang="ts">
	import LocationGate from "#lib/components/location-chooser/LocationGate.svelte";
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import RightNowFeedScreen from "./RightNowFeedScreen.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<PageTitle page={t("shell.navBar.tabs.rightNow")} />
<LocationGate>
	{#snippet children({ geohash })}
		<RightNowFeedScreen ourProfileId={data.ourProfileId} {geohash} />
	{/snippet}
</LocationGate>
