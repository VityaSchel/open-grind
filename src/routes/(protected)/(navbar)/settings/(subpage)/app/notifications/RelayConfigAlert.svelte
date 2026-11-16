<script lang="ts">
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";
	import ShareNetworkIcon from "phosphor-svelte/lib/ShareNetworkIcon";

	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		cancelRelaySetupFlow,
		confirmRelayConfigSaved,
		saveRelayConfigFile,
		shareRelayConfigFile,
	} from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import RelayVerificationCode from "./RelayVerificationCode.svelte";

	type ConfigExport = "save" | "share";

	let { onCloseAutoFocus }: { onCloseAutoFocus: (event: Event) => void } =
		$props();

	const enterCodeId = $props.id();

	let exporting = $state<ConfigExport | null>(null);

	const step = $derived(notificationSettings.relayStep);
	const locked = $derived(
		exporting !== null || notificationSettings.committing,
	);

	dismissOnBackGesture({ active: () => step !== null, dismiss: () => {} });

	async function exportConfig(kind: ConfigExport): Promise<void> {
		exporting = kind;
		try {
			if (kind === "save") await saveRelayConfigFile();
			else await shareRelayConfigFile();
		} finally {
			exporting = null;
		}
	}
</script>

<AlertDialog.Root bind:open={() => step !== null, () => {}}>
	<AlertDialog.Content
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		{onCloseAutoFocus}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("settings.notifications.fastConfig.relaySetup.title")}
			</AlertDialog.Title>
			{#if step === "config"}
				<AlertDialog.Description class="text-wrap">
					{t(
						"settings.notifications.fastConfig.relaySetup.saveConfig",
						{ button: t("common.actions.done") },
					)}
				</AlertDialog.Description>
			{:else if step === "waiting"}
				<AlertDialog.Description class="flex flex-col gap-2 text-wrap">
					<p>
						{t(
							"settings.notifications.fastConfig.relaySetup.waiting",
						)}
					</p>
					<p>
						{t(
							"settings.notifications.fastConfig.relaySetup.waitingHint",
						)}
					</p>
				</AlertDialog.Description>
			{:else if step === "verify"}
				<AlertDialog.Description id={enterCodeId} class="text-wrap">
					{t(
						"settings.notifications.fastConfig.relaySetup.enterCode",
					)}
				</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<div role="status" class="sr-only">
			{#if step === "waiting"}
				{t("settings.notifications.fastConfig.relaySetup.waiting")}
				{t("settings.notifications.fastConfig.relaySetup.waitingHint")}
			{/if}
		</div>
		{#if step === "config"}
			<fieldset disabled={locked} class="flex flex-col gap-2">
				<Button
					variant="secondary"
					size="lg"
					aria-busy={exporting === "save"}
					onclick={() => void exportConfig("save")}
				>
					{#if exporting === "save"}
						<Spinner aria-hidden="true" />
					{:else}
						<DownloadSimpleIcon aria-hidden="true" />
					{/if}
					{t("common.actions.save")}
				</Button>
				<Button
					variant="secondary"
					size="lg"
					aria-busy={exporting === "share"}
					onclick={() => void exportConfig("share")}
				>
					{#if exporting === "share"}
						<Spinner aria-hidden="true" />
					{:else}
						<ShareNetworkIcon aria-hidden="true" />
					{/if}
					{t("common.actions.share")}
				</Button>
			</fieldset>
		{:else if step === "verify"}
			<RelayVerificationCode labelledBy={enterCodeId} />
		{/if}
		<AlertDialog.Footer>
			<fieldset disabled={locked} class="contents">
				<Button
					variant="outline"
					size="lg"
					onclick={() => void cancelRelaySetupFlow()}
				>
					{t("common.actions.cancel")}
				</Button>
				{#if step === "config"}
					<Button size="lg" onclick={confirmRelayConfigSaved}>
						{t("common.actions.done")}
					</Button>
				{/if}
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
