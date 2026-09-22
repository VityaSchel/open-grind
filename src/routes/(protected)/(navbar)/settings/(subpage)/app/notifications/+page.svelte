<script lang="ts">
	import { currentPlatform } from "$lib/platform/os";
	import NotificationCategoriesSetting from "./NotificationCategoriesSetting.svelte";
	import NotificationMasterSetting from "./NotificationMasterSetting.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";

	const platform = currentPlatform();
</script>

{#if platform === "android"}
	<NotificationMasterSetting />
	<NotificationModeSetting />
	<NotificationCategoriesSetting />
{:else}
	<p>Notifications aren't supported on this platform yet.</p>
{/if}

<style lang="postcss">
	@reference "$layout";

	p {
		@apply px-4 text-sm text-muted-foreground;
	}
</style>
