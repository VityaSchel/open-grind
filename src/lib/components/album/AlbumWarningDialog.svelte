<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";

	let {
		open = $bindable(false),
		onview,
	}: { open?: boolean; onview: () => void } = $props();

	dismissOnBackGesture({ active: () => open, dismiss: () => (open = false) });
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("media.album.warning.title")}
			</AlertDialog.Title>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg"
				>{t("common.actions.cancel")}</AlertDialog.Cancel
			>
			<AlertDialog.Action size="lg" onclick={onview}
				>{t("media.album.warning.view")}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
