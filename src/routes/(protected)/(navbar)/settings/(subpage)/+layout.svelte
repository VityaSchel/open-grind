<script lang="ts">
	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SettingsNavBar />
<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex min-h-full w-full px-4 pt-19 pb-nav-clear">
			<div class="mx-auto flex w-full max-w-120 flex-col gap-3 pb-16">
				{@render children?.()}
			</div>
		</div>
	</div>
</main>
