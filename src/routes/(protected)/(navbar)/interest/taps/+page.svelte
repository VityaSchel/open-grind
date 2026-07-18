<script lang="ts">
	import TapsReceivedList from "./TapsReceivedList.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<TapsReceivedList ourProfileId={data.ourProfileId} />
