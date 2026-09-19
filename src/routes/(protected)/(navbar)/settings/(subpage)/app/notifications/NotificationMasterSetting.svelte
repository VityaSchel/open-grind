<script lang="ts">
	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { preferencesLoaded } from "$lib/app-data/preferences.svelte";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import {
		loadNotificationSettings,
		notificationSettings,
		toggleNotifications,
	} from "$lib/push/notifications.svelte";

	$effect(() => {
		if (appLifecycle.active) void loadNotificationSettings();
	});
</script>

<SwitchField
	title="Notifications"
	description="Let Open Grind notify you about messages and taps."
	disabled={!preferencesLoaded() || notificationSettings.phase !== "idle"}
	busy={notificationSettings.permissionPending}
	bind:checked={
		() => notificationSettings.enabled,
		(next: boolean) => void toggleNotifications(next)
	}
/>
