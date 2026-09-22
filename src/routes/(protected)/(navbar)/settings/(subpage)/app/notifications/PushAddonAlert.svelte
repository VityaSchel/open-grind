<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import {
		continueToAddon,
		dismissAddonDialog,
	} from "$lib/push/delivery.svelte";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import { ADDON_NAME, FCM_COMPONENT } from "$lib/updates/components";

	const ADDON = ADDON_NAME[FCM_COMPONENT];

	dismissOnBackGesture({
		active: () => notificationSettings.addonDialog !== null,
		dismiss: dismissAddonDialog,
	});
</script>

<AlertDialog.Root
	bind:open={
		() => notificationSettings.addonDialog !== null,
		(next) => {
			if (!next) dismissAddonDialog();
		}
	}
>
	<AlertDialog.Content interactOutsideBehavior="close">
		<AlertDialog.Header>
			<AlertDialog.Title
				>Install push notifications add-on</AlertDialog.Title
			>
			<AlertDialog.Description class="text-wrap">
				To enable the fast mode, download and install {ADDON} add-on for Open
				Grind. It includes Google's proprietary Firebase library and needs
				Google Play services or microG, so it's not installed by default.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				size="lg"
				onclick={() => void continueToAddon()}
			>
				Continue
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
