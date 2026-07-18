<script lang="ts">
	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SettingsNavBar />
<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full px-4 pt-19 pb-nav-clear">
			<div class="flex flex-col gap-3 w-full max-w-120 m-auto">
				{@render children?.()}
			</div>
		</div>
	</div>
</main>
