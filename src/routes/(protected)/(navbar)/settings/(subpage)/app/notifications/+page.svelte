<script lang="ts">
	import { currentPlatform } from "$lib/platform/os";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";

	const platform = currentPlatform();
</script>

{#if platform === "android"}
	<h2 id="delivery-heading">Delivery</h2>
	<NotificationModeSetting />
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
