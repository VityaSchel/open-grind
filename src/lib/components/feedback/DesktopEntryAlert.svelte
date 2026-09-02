<script lang="ts">
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import { toast } from "svelte-sonner";

	import * as AlertDialog from "$lib/components/ui/alert-dialog";

	let open = $state(false);

	$effect(() => {
		if (!isTauri()) return;
		invoke<boolean>("desktop_entry_offer")
			.then((offered) => (open = offered))
			.catch((error: unknown) => console.error(error));
	});

	function add() {
		open = false;
		invoke("desktop_entry_install")
			.then(() => toast.success("Open Grind added to your applications"))
			.catch((error: unknown) => {
				console.error(error);
				toast.error("Couldn't add Open Grind to your applications");
			});
	}

	function decline() {
		open = false;
		invoke("desktop_entry_dismiss").catch((error: unknown) =>
			console.error(error),
		);
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content interactOutsideBehavior="ignore">
		<AlertDialog.Header>
			<AlertDialog.Title>Add Open Grind to your menu?</AlertDialog.Title>
			<AlertDialog.Description>
				An AppImage runs from wherever you saved it, so your desktop
				does not know about it yet. Open Grind can add itself to your
				applications list, which also gives its window the right icon.
				Nothing outside your home folder changes, and moving or deleting
				the AppImage later is all it takes to undo.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={decline}>No thanks</AlertDialog.Cancel>
			<AlertDialog.Action onclick={add}>Add</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
