<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";

	let {
		open = $bindable(),
		ondiscard,
	}: { open: boolean; ondiscard: () => void } = $props();

	dismissOnBackGesture({ active: () => open, dismiss: () => (open = false) });
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("browse.rightNow.sheet.discard.title")}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{t("browse.rightNow.sheet.discard.description")}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">
				{t("browse.rightNow.sheet.discard.keepEditing")}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					open = false;
					ondiscard();
				}}
			>
				{t("browse.rightNow.sheet.discard.discard")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
