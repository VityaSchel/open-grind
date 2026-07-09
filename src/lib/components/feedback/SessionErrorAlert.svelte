<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { callMethod } from "$lib/api";
	import { sessionErrorState } from "$lib/api/session-error-state.svelte";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";

	const payloadSchema = z.object({
		message: z.string(),
		unauthorized: z.boolean(),
	});

	onMount(() => {
		const unlisten = listen("auth:session-error", (event) => {
			const parsed = payloadSchema.safeParse(event.payload);
			if (!parsed.success) {
				console.error(
					"[auth] unexpected session-error payload",
					parsed.error,
					event.payload,
				);
				return;
			}
			const { message, unauthorized } = parsed.data;
			console.error("[auth] token refresh failed:", message);
			sessionErrorState.message = message;

			if (unauthorized) {
				sessionErrorState.open = false;
				void signOut();
			} else {
				sessionErrorState.open = true;
			}
		});

		return () => {
			void unlisten.then((fn) => fn());
		};
	});

	let busy = $state(false);

	async function copyError() {
		try {
			const clipboard = await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(sessionErrorState.message);
			toast.success("Error copied to clipboard");
		} catch (error) {
			console.error(error);
		}
	}

	async function tryAgain() {
		busy = true;
		try {
			await callMethod("refresh_token");
			sessionErrorState.open = false;
		} catch {
			//
		} finally {
			busy = false;
		}
	}

	async function onSignOut() {
		busy = true;
		try {
			await signOut();
		} finally {
			busy = false;
			sessionErrorState.open = false;
		}
	}
</script>

<AlertDialog.Root bind:open={sessionErrorState.open}>
	<AlertDialog.Content
		escapeKeydownBehavior="ignore"
		interactOutsideBehavior="ignore"
	>
		<AlertDialog.Header>
			<AlertDialog.Title>Can't connect to Grindr</AlertDialog.Title>
			<AlertDialog.Description>
				We couldn't reach Grindr to refresh your session. Check your internet
				connection and try again. If this keeps happening, copy the error and
				report it.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="ghost" onclick={copyError} disabled={busy}>
				Copy error
			</Button>
			<Button variant="outline" onclick={onSignOut} disabled={busy}>
				Sign out
			</Button>
			<Button onclick={tryAgain} disabled={busy}>Try again</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
