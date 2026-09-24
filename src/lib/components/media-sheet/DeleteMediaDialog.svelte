<script lang="ts" generics="Item">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		target = $bindable(),
		video,
		onConfirm,
	}: {
		target: Item | null;
		video: (item: Item) => boolean;
		onConfirm: (item: Item) => void;
	} = $props();

	let latched: Item | null = null;
	const shown = $derived.by(() => {
		if (target !== null) latched = target;
		return latched;
	});
	const noun = $derived(shown !== null && video(shown) ? "video" : "photo");

	dismissOnBackGesture({
		active: () => target !== null,
		dismiss: () => {
			target = null;
		},
	});
</script>

<AlertDialog.Root
	bind:open={
		() => target !== null,
		(open) => {
			if (!open) target = null;
		}
	}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this {noun}?</AlertDialog.Title>
			<AlertDialog.Description>
				It will be deleted from your uploads. This can't be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					const item = target;
					target = null;
					if (item !== null) onConfirm(item);
				}}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
