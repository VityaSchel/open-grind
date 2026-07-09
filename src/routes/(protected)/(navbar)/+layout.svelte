<script lang="ts">
	import NavBar from "$lib/components/shared/NavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col pt-(--safe-area-top) pb-(--content-pb)">
	{@render children?.()}
</div>
<NavBar />
