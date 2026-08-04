<script lang="ts">
	import ViewsGrid from "./ViewsGrid.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<ViewsGrid ourProfileId={data.ourProfileId} />
