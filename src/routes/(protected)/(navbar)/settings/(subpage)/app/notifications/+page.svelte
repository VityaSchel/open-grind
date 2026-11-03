<script lang="ts">
	import { pushAvailableHere } from "#lib/push/index.ts";
	import { offersDeliveryModes } from "#lib/push/notification-state.svelte.ts";
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
		class="fixed inset-y-0 right-[calc(1rem+var(--safe-area-right))] left-[calc(1rem+var(--safe-area-left))] m-auto size-fit text-center text-sm text-balance text-muted-foreground"
	>
		Notifications are not supported on this platform yet.
	</p>
{/if}
