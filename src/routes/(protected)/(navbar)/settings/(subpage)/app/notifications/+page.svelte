<script lang="ts">
	import { t } from "$lib/i18n";
	import { currentPlatform, platformNames } from "$lib/platform/os";
	import NotificationCategoriesSetting from "./NotificationCategoriesSetting.svelte";
	import NotificationMasterSetting from "./NotificationMasterSetting.svelte";
	import NotificationModeSetting from "./NotificationModeSetting.svelte";

	const platform = currentPlatform();
	const names: Partial<Record<typeof platform, string>> = platformNames;
	const platformName = names[platform];
</script>

{#if platform === "android"}
	<NotificationMasterSetting />
	<NotificationModeSetting />
	<NotificationCategoriesSetting />
{:else}
	<p
		class="fixed inset-x-4 inset-y-0 m-auto size-fit text-center text-sm text-balance text-muted-foreground"
	>
		{platformName === undefined
			? t("settings.notifications.unsupported")
			: t("settings.notifications.unsupportedOn", {
					platform: platformName,
				})}
	</p>
{/if}
