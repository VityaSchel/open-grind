<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { copyToClipboard } from "$lib/api/error-copy";
	import {
		asAppError,
		blockedKindOf,
		callMethod,
		markRequestBlocked,
		summarizeServerMessage,
	} from "$lib/api/methods";
	import { capText, scrubText } from "$lib/api/redact/text";
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
	import { Spinner } from "$lib/components/ui/spinner";
	import { type MessageKey, sourceText, t, type Translate } from "$lib/i18n";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { ws } from "$lib/ws.svelte";

	type SessionErrorVariant = "rateLimited" | "refused" | "unreachable";

	const copyKeys = {
		rateLimited: {
			title: "feedback.sessionError.rateLimited.title",
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

	let running: false | "tryAgain" | "signOut" = $state(false);

	const escapeKeydownBehavior = $derived(running ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => sessionErrorState.open,
		dismiss: () => {
			if (!running) sessionRecovery.dismiss();
		},
	});

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

	const copiedDetail = $derived(
		withAttempts({
			detail: scrubText(sessionErrorState.message),
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
				toast.error(t("feedback.sessionError.expired"));
				await onSignOut();
				return;
			}
			toast.error(
				appError?.prettyMessage ??
					t("feedback.sessionError.errors.tryAgainFailed"),
			);
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
			<fieldset disabled={running !== false} class="contents">
				<Button
					variant="ghost"
					onclick={() => void copyToClipboard({ text: copiedDetail })}
				>
					{t("common.actions.copyError")}
				</Button>
				<Button
					variant="ghost"
					onclick={() => sessionRecovery.dismiss()}
				>
					{t("feedback.sessionError.dismiss")}
				</Button>
				<Button
					variant="outline"
					onclick={onSignOut}
					aria-busy={running === "signOut"}
				>
					{#if running === "signOut"}
						<Spinner aria-hidden="true" />
					{/if}
					{t("common.actions.signOut")}
				</Button>
				<Button onclick={tryAgain} aria-busy={running === "tryAgain"}>
					{#if running === "tryAgain"}
						<Spinner aria-hidden="true" />
					{/if}
					{t("common.actions.retry")}
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
