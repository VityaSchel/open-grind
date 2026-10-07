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
		type SessionErrorKind,
		sessionErrorKinds,
		sessionErrorState,
	} from "$lib/api/session-error-state.svelte";
	import { sessionRecovery } from "$lib/api/session-recovery.svelte";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { type MessageKey, sourceText, t, type Translate } from "$lib/i18n";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { ws } from "$lib/ws.svelte";

	type SessionErrorVariant = "rateLimited" | "refused" | "unreachable";

	const copyKeys = {
		rateLimited: {
			title: "feedback.appError.rateLimited",
			description: "feedback.sessionError.rateLimited.description",
		},
		refused: {
			title: "feedback.sessionError.refused.title",
			description: "feedback.sessionError.refused.description",
		},
		unreachable: {
			title: "feedback.sessionError.unreachable.title",
			description: "feedback.sessionError.unreachable.description",
		},
	} as const satisfies Record<
		SessionErrorVariant,
		Record<"title" | "description", MessageKey>
	>;

	const variants = {
		Http: "unreachable",
		RateLimited: "rateLimited",
		RequestBlocked: "unreachable",
		NetworkBlocked: "unreachable",
		Unauthorized: "unreachable",
		Auth: "refused",
		SessionStale: "refused",
		Api: "refused",
		Banned: "unreachable",
		NotSignedIn: "unreachable",
	} as const satisfies Record<SessionErrorKind, SessionErrorVariant>;

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

	dismissOnBackGesture({
		active: () => sessionErrorState.open,
		dismiss: () => sessionRecovery.dismiss(),
	});

	let busy = $state(false);

	const copy = $derived(copyKeys[variants[sessionErrorState.kind]]);

	const maxShownMessageChars = 300;

	function withAttempts({
		detail,
		translate,
	}: {
		detail: string;
		translate: Translate;
	}): string {
		const count = sessionErrorState.attempts;
		return count > 0
			? translate("feedback.sessionError.detailAfterAttempts", {
					detail,
					count,
				})
			: detail;
	}

	const detail = $derived(
		withAttempts({
			detail: sessionErrorState.message,
			translate: sourceText,
		}),
	);

	const shownDetail = $derived(
		withAttempts({
			detail: capText(
				summarizeServerMessage(sessionErrorState.message),
				maxShownMessageChars,
			),
			translate: t,
		}),
	);

	async function copyError() {
		try {
			const clipboard =
				await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(detail);
			toast.success(t("feedback.sessionError.copied"));
		} catch (error) {
			console.error(error);
		}
	}

	async function tryAgain() {
		busy = true;
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
				toast.error(t("feedback.sessionError.expired"));
				await onSignOut();
				return;
			}
			toast.error(
				appError?.prettyMessage ??
					t("feedback.sessionError.errors.tryAgainFailed"),
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
			<AlertDialog.Title>{t(copy.title)}</AlertDialog.Title>
			<AlertDialog.Description
				>{t(copy.description)}</AlertDialog.Description
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
			<Button variant="ghost" onclick={copyError} disabled={busy}>
				{t("common.actions.copyError")}
			</Button>
			<Button
				variant="ghost"
				onclick={() => sessionRecovery.dismiss()}
				disabled={busy}
			>
				{t("feedback.sessionError.dismiss")}
			</Button>
			<Button variant="outline" onclick={onSignOut} disabled={busy}>
				{t("feedback.actions.signOut")}
			</Button>
			<Button onclick={tryAgain} disabled={busy}
				>{t("feedback.sessionError.tryAgain")}</Button
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
