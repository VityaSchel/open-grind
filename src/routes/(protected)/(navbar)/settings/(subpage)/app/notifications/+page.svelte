<script lang="ts">
	import { t } from "$lib/i18n";
	import { isAndroidPlatform } from "$lib/platform/os";
	import { pushAvailableHere } from "$lib/push";
	import NotificationCategoriesSetting from "./NotificationCategoriesSetting.svelte";
	import NotificationMasterSetting from "./NotificationMasterSetting.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";
</script>

{#if pushAvailableHere()}
	<NotificationMasterSetting />
	{#if isAndroidPlatform()}
		<NotificationModeSetting />
	{/if}
	<NotificationCategoriesSetting />
{:else}
	<p
		class="fixed inset-x-4 inset-y-0 m-auto size-fit text-center text-sm text-balance text-muted-foreground"
	>
		{t("settings.notifications.unsupported")}
	</p>
{/if}
