<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
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
			<AlertDialog.Title>Install reCAPTCHA helper</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				Wrong email or password, or Grindr wants a captcha check. The
				check needs the reCAPTCHA helper add-on for Open Grind and the
				official Grindr app installed. The add-on includes Google's
				proprietary reCAPTCHA library, so it's not installed by default.
				{#if installedFromFdroid()}
					This add-on bypasses F-Droid's checks.
				{/if}
				<Link
					href={RECAPTCHA_HELPER_GUIDE}
					class="font-medium text-primary underline underline-offset-2"
				>
					Learn more
				</Link>
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action size="lg" onclick={onContinue}>
				Continue
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
