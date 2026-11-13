<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
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
			<AlertDialog.Title>Discard changes?</AlertDialog.Title>
			<AlertDialog.Description>
				You have unsaved changes.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Keep editing</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					open = false;
					ondiscard();
				}}
			>
				Discard
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
