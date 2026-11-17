<script lang="ts">
	import { t } from "#lib/i18n/index.ts";
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
		class="fixed inset-y-0 inset-x-safe-4 m-auto size-fit text-center text-sm text-balance text-muted-foreground"
	>
		{t("settings.notifications.unsupported")}
	</p>
{/if}
