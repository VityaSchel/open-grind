<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";

	let {
		open = $bindable(false),
		count,
		onConfirm,
	}: {
		open?: boolean;
		count: number;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content preventOverflowTextSelection={false}>
		<AlertDialog.Header>
			<AlertDialog.Title>
				Delete
				{#if count === 1}
					conversation
				{:else}
					{count} conversations
				{/if}?
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if count === 1}
					This conversation
				{:else}
					These conversations
				{/if}
				will be deleted for you only. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					open = false;
					onConfirm();
				}}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
