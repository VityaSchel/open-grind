<script lang="ts">
	import ShowDistanceSetting from "./ShowDistanceSetting.svelte";

	const { data }: import("./$types").PageProps = $props();
</script>

<ShowDistanceSetting ourProfileId={data.ourProfileId} />
