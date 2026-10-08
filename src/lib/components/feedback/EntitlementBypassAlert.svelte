<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import Link from "$lib/components/ui/link/Link.svelte";
	import {
		dismissEntitlementBypass,
		entitlementBypassState,
		runEntitlementBypass,
	} from "$lib/entitlements/bypass.svelte";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	const escapeKeydownBehavior = $derived(
		entitlementBypassState.busy ? "ignore" : "close",
	);

	dismissOnBackGesture({
		active: () => entitlementBypassState.open,
		dismiss: () => {
			if (!entitlementBypassState.busy) dismissEntitlementBypass();
		},
	});
</script>

<AlertDialog.Root
	bind:open={entitlementBypassState.open}
	onOpenChange={(open) => {
		if (!open) dismissEntitlementBypass();
	}}
>
	<AlertDialog.Content
		{escapeKeydownBehavior}
		interactOutsideBehavior="ignore"
	>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{t("feedback.entitlementBypass.title")}</AlertDialog.Title
			>
			<AlertDialog.Description>
				<p class="mb-3">
					{entitlementBypassState.reason === null
						? ""
						: t(entitlementBypassState.reason)}
				</p>
				<Rich key="feedback.entitlementBypass.explanation">
					{#snippet bypassGuideLink(text)}<Link
							href="https://opengrind.org/guides/bypasses"
							>{text}</Link
						>{/snippet}
				</Rich>
			</AlertDialog.Description>
		</AlertDialog.Header>
		<fieldset disabled={entitlementBypassState.busy} class="contents">
			<AlertDialog.Footer>
				<AlertDialog.Cancel size="lg"
					>{t("common.actions.cancel")}</AlertDialog.Cancel
				>
				<AlertDialog.Action
					size="lg"
					onclick={() => void runEntitlementBypass()}
				>
					{t("feedback.entitlementBypass.bypass")}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</fieldset>
	</AlertDialog.Content>
</AlertDialog.Root>
