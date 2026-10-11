<script lang="ts" generics="Item">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { t } from "$lib/i18n";
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
	const shownVideo = $derived(shown !== null && video(shown));

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
			<AlertDialog.Title>
				{shownVideo
					? t("media.sheet.deleteDialog.videoTitle")
					: t("media.sheet.deleteDialog.photoTitle")}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{t("media.sheet.deleteDialog.description")}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">
				{t("common.actions.cancel")}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					const item = target;
					target = null;
					if (item !== null) onConfirm(item);
				}}
			>
				{t("common.actions.delete")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
