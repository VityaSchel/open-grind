<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import {
		asAppError,
		blockedKindOf,
		callMethod,
		markRequestBlocked,
		summarizeServerMessage,
	} from "$lib/api/methods";
	import { capText } from "$lib/api/redact/text";
	import {
		clearSessionError,
		sessionErrorKinds,
		sessionErrorState,
	} from "$lib/api/session-error-state.svelte";
	import { sessionRecovery } from "$lib/api/session-recovery.svelte";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { ws } from "$lib/ws.svelte";

	const payloadSchema = z.object({
		message: z.string(),
		unauthorized: z.boolean(),
		kind: z.enum(sessionErrorKinds).catch("Http"),
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

	let running: false | "tryAgain" | "signOut" = $state(false);

	const escapeKeydownBehavior = $derived(running ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => sessionErrorState.open,
		dismiss: () => {
			if (!running) sessionRecovery.dismiss();
		},
	});

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
			case "SessionStale":
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

	const maxShownMessageChars = 300;

	const attemptsSuffix = $derived(
		sessionErrorState.attempts > 0
			? ` (after ${sessionErrorState.attempts} ${
					sessionErrorState.attempts === 1 ? "attempt" : "attempts"
				})`
			: "",
	);

	const detail = $derived(sessionErrorState.message + attemptsSuffix);

	const shownDetail = $derived(
		capText(
			summarizeServerMessage(sessionErrorState.message),
			maxShownMessageChars,
		) + attemptsSuffix,
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
		running = "tryAgain";
		try {
			await callMethod("refresh_session");
			clearSessionError();
		} catch (error) {
			const appError = asAppError(error);
			const blockedKind = blockedKindOf(appError?.kind);
			if (blockedKind && markRequestBlocked({ kind: blockedKind })) {
				return;
			}
			if (appError?.kind === "NotSignedIn") {
				toast.error("Your session expired — please sign in again");
				await onSignOut();
				return;
			}
			toast.error(appError?.prettyMessage ?? "Still can't connect");
		} finally {
			running = false;
		}
	}

	async function onSignOut() {
		running = "signOut";
		try {
			await signOut();
		} finally {
			running = false;
			sessionErrorState.open = false;
		}
	}
</script>

<AlertDialog.Root
	bind:open={sessionErrorState.open}
	onOpenChange={(open) => {
		if (!open) sessionRecovery.dismiss();
	}}
>
	<AlertDialog.Content
		{escapeKeydownBehavior}
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
				{shownDetail}
			</p>
		{/if}
		<AlertDialog.Footer>
			<fieldset disabled={running !== false} class="contents">
				<Button variant="ghost" onclick={copyError}>Copy error</Button>
				<Button
					variant="ghost"
					onclick={() => sessionRecovery.dismiss()}
				>
					Dismiss
				</Button>
				<Button
					variant="outline"
					onclick={onSignOut}
					aria-busy={running === "signOut"}
				>
					{#if running === "signOut"}
						<Spinner aria-hidden="true" />
					{/if}
					Sign out
				</Button>
				<Button onclick={tryAgain} aria-busy={running === "tryAgain"}>
					{#if running === "tryAgain"}
						<Spinner aria-hidden="true" />
					{/if}
					Try again
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
