<script lang="ts">
	import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { t } from "$lib/i18n";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import { toggleNotifications } from "$lib/push/notifications.svelte";
</script>

<SwitchField
	title={t("settings.notifications.enable")}
	class="border-transparent"
	disabled={!preferencesLoaded() || notificationSettings.busy}
	busy={notificationSettings.permissionPending}
	bind:checked={
		() => notificationSettings.enabled,
		(next: boolean) => void toggleNotifications(next)
	}
/>
