<script lang="ts">
	import LocationGate from "#lib/components/location-chooser/LocationGate.svelte";
	import RightNowFeedScreen from "./RightNowFeedScreen.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<LocationGate>
	{#snippet children({ geohash })}
		<RightNowFeedScreen ourProfileId={data.ourProfileId} {geohash} />
	{/snippet}
</LocationGate>
