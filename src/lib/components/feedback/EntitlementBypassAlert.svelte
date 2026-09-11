<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import Link from "$lib/components/ui/link/Link.svelte";
	import {
		dismissEntitlementBypass,
		entitlementBypassState,
		runEntitlementBypass,
	} from "$lib/entitlements/bypass.svelte";
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
			<AlertDialog.Title>Paid feature</AlertDialog.Title>
			<AlertDialog.Description>
				<p class="mb-3">{entitlementBypassState.reason}</p>
				Open Grind can attempt to bypass this by momentarily spoofing your
				geolocation to Honduras.
				<Link href="https://opengrind.org/guides/bypasses">
					Learn more
				</Link>.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<fieldset disabled={entitlementBypassState.busy} class="contents">
			<AlertDialog.Footer>
				<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					size="lg"
					onclick={() => void runEntitlementBypass()}
				>
					Bypass
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</fieldset>
	</AlertDialog.Content>
</AlertDialog.Root>
