<script lang="ts">
	import TapsReceivedList from "./TapsReceivedList.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<div class="flex-1 max-w-120 w-full mx-auto">
	<TapsReceivedList ourProfileId={data.ourProfileId} />
</div>
