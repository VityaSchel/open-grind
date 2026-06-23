<script lang="ts">
	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SettingsNavBar />
<div class="flex w-full px-4 pt-19">
	<main class="pb-(--content-pb) flex flex-col gap-3 w-full max-w-120 m-auto">
		{@render children?.()}
	</main>
</div>
