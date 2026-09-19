<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import {
		dismissAddonRequest,
		installPushAddon,
		notificationSettings,
	} from "$lib/push/notifications.svelte";
</script>

<AlertDialog.Root
	bind:open={
		() => notificationSettings.addonRequested,
		(next) => {
			if (!next) dismissAddonRequest();
		}
	}
>
	<AlertDialog.Content interactOutsideBehavior="close">
		<AlertDialog.Header>
			<AlertDialog.Title>Install the FCM service?</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				Instant notifications need the Open Grind FCM service, a small
				separate app that receives them from Google and hands them to
				Open Grind. It contains Google's proprietary Firebase library,
				which is why it is not part of Open Grind itself. Open Grind
				verifies its signature before installing it.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Not now</AlertDialog.Cancel>
			<Button onclick={() => void installPushAddon()}>Install</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
