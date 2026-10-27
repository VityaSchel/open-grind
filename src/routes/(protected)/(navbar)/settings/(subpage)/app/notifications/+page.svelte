<script lang="ts">
	import { pushAvailableHere } from "$lib/push";
	import { offersDeliveryModes } from "$lib/push/notification-state.svelte";
	import NotificationCategoriesSetting from "./NotificationCategoriesSetting.svelte";
	import NotificationMasterSetting from "./NotificationMasterSetting.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";
</script>

{#if pushAvailableHere()}
	<NotificationMasterSetting />
	{#if offersDeliveryModes()}
		<NotificationModeSetting />
	{/if}
	<NotificationCategoriesSetting />
{:else}
	<p
		class="fixed inset-x-4 inset-y-0 m-auto size-fit text-center text-sm text-balance text-muted-foreground"
	>
		Notifications are not supported on this platform yet.
	</p>
{/if}
