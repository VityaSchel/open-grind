<script lang="ts">
	import { fastModeOffered } from "$lib/push/notifications.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";

	const fastOffered = fastModeOffered();
</script>

<h2>Delivery</h2>
<NotificationModeSetting {fastOffered} />

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}
</style>
