<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { installedFromFdroid } from "#lib/updates/capability.svelte.ts";
	import { RECAPTCHA_HELPER_GUIDE } from "#lib/updates/manual-install.ts";

	let {
		open = $bindable(),
		onContinue,
	}: { open: boolean; onContinue: () => void } = $props();

	dismissOnBackGesture({ active: () => open, dismiss: () => (open = false) });
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content interactOutsideBehavior="close">
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("auth.signIn.captcha.helper.title")}
			</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				{t("auth.signIn.captcha.helper.description")}
				{#if installedFromFdroid()}
					{t("common.addons.fdroidNotice")}
				{/if}
				<Link
					href={RECAPTCHA_HELPER_GUIDE}
					class="font-medium text-primary underline underline-offset-2"
				>
					{t("common.actions.learnMore")}
				</Link>
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">
				{t("common.actions.cancel")}
			</AlertDialog.Cancel>
			<AlertDialog.Action size="lg" onclick={onContinue} data-autofocus>
				{t("common.actions.continue")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
