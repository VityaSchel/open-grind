<script lang="ts">
	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<nav>
	<SettingsNavBar />
</nav>
<div class="flex w-full px-4">
	<main class="pb-(--content-pb) flex flex-col gap-3 w-full max-w-120 m-auto">
		{@render children?.()}
	</main>
</div>
