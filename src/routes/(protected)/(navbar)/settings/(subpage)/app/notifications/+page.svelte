<script lang="ts">
	import { currentPlatform } from "$lib/platform/os";
	import NotificationCategoriesSetting from "./NotificationCategoriesSetting.svelte";
	import NotificationMasterSetting from "./NotificationMasterSetting.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";

	const platform = currentPlatform();
</script>

{#if platform === "android"}
	<NotificationMasterSetting />
	<h2 id="delivery-heading">Delivery</h2>
	<NotificationModeSetting />
	<h2>Categories</h2>
	<NotificationCategoriesSetting />
{:else}
	<p>Notifications aren't supported on this platform yet.</p>
{/if}

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}

	p {
		@apply px-4 text-sm text-muted-foreground;
	}
</style>
