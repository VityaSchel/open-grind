<script lang="ts">
	import PageStack from "./page-stack/PageStack.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<PageStack scope="/settings">
	{@render children?.()}
</PageStack>
