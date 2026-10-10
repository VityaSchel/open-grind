<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { t } from "$lib/i18n";

	let {
		open = $bindable(false),
		count,
		onConfirm,
	}: { open?: boolean; count: number; onConfirm: () => void } = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{count === 1
					? t("chat.deleteConversations.one.title")
					: t("chat.deleteConversations.many.title", { count })}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{count === 1
					? t("chat.deleteConversations.one.description")
					: t("chat.deleteConversations.many.description", { count })}
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
					open = false;
					onConfirm();
				}}
			>
				{t("common.actions.delete")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
