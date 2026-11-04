<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		continueToAddon,
		dismissAddonDialog,
	} from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import { installedFromFdroid } from "#lib/updates/capability.svelte.ts";

	let { onCloseAutoFocus }: { onCloseAutoFocus: (event: Event) => void } =
		$props();

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
	<AlertDialog.Content interactOutsideBehavior="close" {onCloseAutoFocus}>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("settings.notifications.addon.title")}
			</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				{t("settings.notifications.addon.description")}
				{#if installedFromFdroid()}
					{t("common.addons.fdroidNotice")}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">
				{t("common.actions.cancel")}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				size="lg"
				onclick={() => void continueToAddon()}
			>
				{t("common.actions.continue")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
