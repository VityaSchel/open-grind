<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { asAppError, callMethod } from "$lib/api/methods";
	import {
		clearSessionError,
		sessionErrorState,
	} from "$lib/api/session-error-state.svelte";
	import { sessionRecovery } from "$lib/api/session-recovery.svelte";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { ws } from "$lib/ws.svelte";

	const payloadSchema = z.object({
		message: z.string(),
		unauthorized: z.boolean(),
		kind: z
			.enum([
				"Http",
				"RateLimited",
				"RequestBlocked",
				"NetworkBlocked",
				"Unauthorized",
				"Auth",
				"Api",
				"Banned",
				"NotLoggedIn",
			])
			.catch("Http"),
		attempts: z.number().catch(0),
		transient: z.boolean().catch(true),
	});

	onMount(() => {
		const unlisteners = [
			listen("auth:session-error", (event) => {
				const parsed = payloadSchema.safeParse(event.payload);
				if (!parsed.success) {
					console.error(
						"[auth] unexpected session-error payload",
						parsed.error,
						event.payload,
					);
					return;
				}
				const report = parsed.data;
				console.error("[auth] token refresh failed:", report.message);

				if (report.unauthorized) {
					sessionRecovery.recover();
					void signOut();
					return;
				}
				sessionRecovery.report(report);
			}),
			listen("auth:session-ok", () => {
				sessionRecovery.recover();
			}),
			ws.onConnected(() => {
				sessionRecovery.recover();
			}),
		];

		return () => {
			for (const unlisten of unlisteners) {
				void unlisten.then((fn) => fn());
			}
		};
	});

	dismissOnBackGesture({
		active: () => sessionErrorState.open,
		dismiss: () => sessionRecovery.dismiss(),
	});

	let busy = $state(false);

	const copy = $derived.by(() => {
		switch (sessionErrorState.kind) {
			case "RateLimited":
				return {
					title: "Grindr is rate limiting us",
					description:
						"Grindr turned away our attempts to refresh your session. Wait a moment and try again.",
				};
			case "Api":
			case "Auth":
				return {
					title: "Grindr refused your session",
					description:
						"Grindr wouldn't refresh your session. Try again, and if it keeps happening, copy the error and report it.",
				};
			default:
				return {
					title: "Can't connect to Grindr",
					description:
						"We couldn't reach Grindr to refresh your session. Check your internet connection and try again. If this keeps happening, copy the error and report it.",
				};
		}
	});

	const detail = $derived(
		sessionErrorState.attempts > 0
			? `${sessionErrorState.message} (after ${sessionErrorState.attempts} ${
					sessionErrorState.attempts === 1 ? "attempt" : "attempts"
				})`
			: sessionErrorState.message,
	);

	async function copyError() {
		try {
			const clipboard =
				await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(detail);
			toast.success("Error copied to clipboard");
		} catch (error) {
			console.error(error);
		}
	}

	async function tryAgain() {
		busy = true;
		try {
			await callMethod("refresh_token");
			clearSessionError();
		} catch (error) {
			if (asAppError(error)?.kind === "NotLoggedIn") {
				toast.error("Your session expired — please sign in again");
				await onSignOut();
				return;
			}
			toast.error(
				asAppError(error)?.prettyMessage ?? "Still can't connect",
			);
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
			<AlertDialog.Title>{copy.title}</AlertDialog.Title>
			<AlertDialog.Description>{copy.description}</AlertDialog.Description
			>
		</AlertDialog.Header>
		{#if sessionErrorState.message}
			<p
				class="rounded-md bg-muted px-3 py-2 font-mono text-xs wrap-break-word text-muted-foreground"
			>
				{detail}
			</p>
		{/if}
		<AlertDialog.Footer>
			<Button variant="ghost" onclick={copyError} disabled={busy}>
				Copy error
			</Button>
			<Button
				variant="ghost"
				onclick={() => sessionRecovery.dismiss()}
				disabled={busy}
			>
				Dismiss
			</Button>
			<Button variant="outline" onclick={onSignOut} disabled={busy}>
				Sign out
			</Button>
			<Button onclick={tryAgain} disabled={busy}>Try again</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
