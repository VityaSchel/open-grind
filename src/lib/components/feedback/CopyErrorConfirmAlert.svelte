<script lang="ts">
	import {
		copyErrorConfirmState,
		settleCopyErrorConfirm,
	} from "$lib/api/copy-error-confirm-state.svelte";
	import { getErrorText } from "$lib/api/error-copy";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import Label from "$lib/components/ui/label/label.svelte";
	import Switch from "$lib/components/ui/switch/switch.svelte";

	let redact = $state(true);
	const preview = $derived(
		getErrorText(copyErrorConfirmState.error, { redact }),
	);
</script>

<AlertDialog.Root
	bind:open={copyErrorConfirmState.open}
	onOpenChange={(open) => {
		if (!open) {
			settleCopyErrorConfirm({ abort: true });
			redact = true;
		}
	}}
>
	<AlertDialog.Content
		class="max-h-[calc(var(--screen-safe)-2rem)]  shrink-0 overflow-auto max-sm:max-w-[calc(100%-2rem)]!"
		interactOutsideBehavior="close"
	>
		<div class="grid grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
			<AlertDialog.Header>
				<AlertDialog.Title>Copy error details?</AlertDialog.Title>
				<AlertDialog.Description class="text-wrap">
					<b>Be mindful of what you share on the internet!</b> The error
					might contain your personal data. Only copy it unredacted if a
					developer asks you to.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<div
				class="flex max-w-full min-w-0 flex-col overflow-clip rounded-[22px] bg-muted"
			>
				<Label
					for="redact-sensitive-info"
					class="flex-1 rounded-t-[inherit] pe-3 pt-3 pb-2"
				>
					<Switch
						id="redact-sensitive-info"
						class="ms-3"
						bind:checked={redact}
					/>
					<span class="truncate">
						Redact sensitive info (recommended)
					</span>
				</Label>
				<div
					class="max-h-[max(40dvh,160px)] min-h-0 w-full overflow-auto border border-border/30"
				>
					<pre
						class="size-max rounded-none p-3 text-left text-xs whitespace-pre-wrap">{preview}</pre>
				</div>
				<div class="flex flex-col">
					<Button
						onclick={() => settleCopyErrorConfirm({ redact })}
						class="rounded-t-none rounded-b-[inherit] border-0"
						size="lg"
					>
						Copy
					</Button>
				</div>
			</div>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Close</AlertDialog.Cancel>
			</AlertDialog.Footer>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>
