<script lang="ts">
	import PageStack from "$lib/components/navigation/PageStack.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<PageStack scope="/settings">
	{@render children?.()}
</PageStack>
