<script lang="ts">
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import { googleHandoffState } from "$lib/api/google-handoff-state.svelte";
	import { callMethod } from "$lib/api/methods";
	import {
		companionDisabled,
		companionRefused,
		companionUnavailable,
		companionUntrusted,
		disabledCompanionMessage,
		finishSignIn,
		refusedCompanionMessage,
		reportSignInFailure,
		untrustedCompanionMessage,
	} from "$lib/api/sign-in";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { isAndroidPlatform } from "$lib/platform/os";
	import { isPlayBuild } from "$lib/platform/store";
	import { getInstalledVersion, GOOGLE_OAUTH_COMPONENT } from "$lib/updates";
	import {
		addonActivity,
		addonInstallerAvailable,
		addonPublishedHere,
		addonUpdates,
	} from "$lib/updates/addon.svelte";
	import { installedFromFdroid } from "$lib/updates/capability.svelte";
	import { manualInstallHref } from "$lib/updates/manual-install";
	import {
		googleSignInView,
		installButton,
		stageAwaitsUser,
	} from "./google-sign-in-view";

	const companionHref = manualInstallHref(GOOGLE_OAUTH_COMPONENT);
	const automated = isAndroidPlatform();

	let token = $state("");
	let submitting = $state(false);
	let continuing = $state(false);
	let starting = $state(false);
	let pasting = $state(page.url.searchParams.has("paste"));
	let installed = $state(false);
	let launchFailed = $state(false);
	let probes = 0;
	let answered = 0;

	const view = $derived(
		googleSignInView({
			automated,
			pasting,
			installed: installed && !launchFailed,
		}),
	);
	const install = $derived(
		installButton({ stage: addonActivity.stage, starting }),
	);

	$effect(() => {
		void addonActivity.installs;
		launchFailed = false;
		void probeInstalled();
	});

	async function probeInstalled(): Promise<boolean> {
		if (!automated) return false;
		const probe = ++probes;
		const presence = await getInstalledVersion(GOOGLE_OAUTH_COMPONENT).then(
			(version) => (version === null ? "absent" : "present"),
			() => "unknown",
		);
		if (probe > answered) {
			answered = probe;
			installed = presence === "present";
			if (presence === "absent" && stageAwaitsUser(addonActivity.stage)) {
				await addonUpdates.withdrawUpdate();
			}
		}
		return installed;
	}

	async function installCompanion() {
		if (starting) return;
		starting = true;
		try {
			if (!launchFailed && (await probeInstalled())) {
				void continueInCompanion();
			} else if (
				addonInstallerAvailable() &&
				(await addonPublishedHere())
			) {
				await addonUpdates.installNow();
			} else {
				openExternalLink(companionHref);
			}
		} finally {
			starting = false;
		}
	}

	async function continueInCompanion() {
		if (continuing) return;
		continuing = true;
		try {
			finishSignIn(await callMethod("sign_in_with_google"));
		} catch (error) {
			reportSignInFailure({
				error,
				onAuthFailure: (message) => {
					if (message === companionUnavailable) {
						launchFailed = true;
						toast.error(
							t("auth.signIn.companion.errors.unavailable"),
						);
						return true;
					}
					if (message === companionDisabled) {
						toast.error(disabledCompanionMessage());
						return true;
					}
					if (message === companionUntrusted) {
						toast.error(untrustedCompanionMessage());
						pasting = true;
						return true;
					}
					if (message === companionRefused) {
						toast.error(refusedCompanionMessage());
						pasting = true;
						return true;
					}
					return false;
				},
			});
		} finally {
			continuing = false;
		}
	}
</script>

<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState !== "visible") return;
		launchFailed = false;
		void probeInstalled();
	}}
/>

{#snippet companionLink(text: string)}
	<Link
		href={companionHref}
		class="font-medium text-primary underline underline-offset-2"
	>
		{text}
	</Link>
{/snippet}

{#if googleHandoffState.phase === "signingIn"}
	<Card.Root class="m-auto w-full max-w-sm gap-2">
		<Card.Header>
			<Card.Title>{t("auth.signIn.google.signingIn.title")}</Card.Title>
			<Card.Description>
				{t("auth.signIn.google.signingIn.description")}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex justify-center py-4">
			<Spinner class="size-6" />
		</Card.Content>
	</Card.Root>
{:else}
	<div class="m-auto flex w-full max-w-sm flex-col gap-3">
		<form
			onsubmit={async (event) => {
				event.preventDefault();
				try {
					submitting = true;
					finishSignIn(
						await callMethod("sign_in_with_google_token", {
							token: token.trim(),
						}),
					);
				} catch (error) {
					reportSignInFailure({ error });
				} finally {
					submitting = false;
				}
			}}
			class="contents"
		>
			<Card.Root class="gap-4">
				<Card.Header>
					<Card.Title>{t("auth.signIn.withGoogle")}</Card.Title>
					<Card.Description>
						{#if view === "install" && isPlayBuild()}
							<Rich
								key="auth.signIn.google.install.playDescription"
								{companionLink}
							/>
						{:else if view === "install"}
							<Rich
								key="auth.signIn.google.install.description"
								{companionLink}
							/>
							{#if installedFromFdroid()}
								<span class="mt-2 block">
									{t(
										"auth.signIn.google.install.fdroidNotice",
									)}
								</span>
							{/if}
						{:else if view === "continue"}
							<Rich
								key="auth.signIn.google.continue.description"
								{companionLink}
							/>
						{:else}
							<ol class="ms-5 list-decimal">
								<li>
									<Rich
										key="auth.signIn.google.paste.steps.install"
										{companionLink}
									/>
								</li>
								<li>
									{t(
										"auth.signIn.google.paste.steps.copyToken",
									)}
								</li>
								<li>
									{t(
										"auth.signIn.google.paste.steps.submit",
										{ button: t("auth.signIn.submit") },
									)}
								</li>
							</ol>
						{/if}
					</Card.Description>
				</Card.Header>
				{#if view === "paste"}
					<Card.Content>
						<div class="mt-2 grid gap-2">
							<Label for="token">
								{t("auth.signIn.google.paste.token.label")}
							</Label>
							<Textarea
								id="token"
								placeholder={t(
									"auth.signIn.google.paste.token.placeholder",
								)}
								required
								rows={5}
								bind:value={token}
								disabled={submitting}
								class="rounded-lg font-mono text-sm"
							/>
						</div>
					</Card.Content>
				{/if}
				<Card.Footer class="flex-col gap-2">
					{#if view === "install"}
						<Button
							class="w-full"
							disabled={install.busy}
							aria-busy={install.busy}
							onclick={installCompanion}
						>
							{#if install.busy}
								<Spinner aria-hidden="true" />
							{/if}
							{install.label}
						</Button>
					{:else if view === "continue"}
						<Button
							class="w-full"
							disabled={continuing}
							aria-busy={continuing}
							onclick={continueInCompanion}
						>
							{#if continuing}
								<Spinner aria-hidden="true" />
							{/if}
							{t("common.actions.continue")}
						</Button>
					{:else}
						<Button
							type="submit"
							class="w-full"
							disabled={submitting || token.trim().length === 0}
						>
							{t("auth.signIn.submit")}
						</Button>
					{/if}
					<Button
						variant="outline"
						class="w-full"
						href="/auth/sign-in"
						disabled={submitting || continuing}
					>
						{t("auth.signIn.google.goBack")}
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>
		{#if automated}
			<p class="text-center text-sm text-muted-foreground">
				{#if view === "paste"}
					<Rich key="auth.signIn.google.useCompanion">
						{#snippet companionButton(text)}
							<Button
								variant="link"
								class="h-auto p-0"
								disabled={submitting}
								onclick={() => (pasting = false)}
							>
								{text}
							</Button>
						{/snippet}
					</Rich>
				{:else}
					<Rich key="auth.signIn.google.pasteManually">
						{#snippet pasteButton(text)}
							<Button
								variant="link"
								class="h-auto p-0"
								disabled={continuing}
								onclick={() => (pasting = true)}
							>
								{text}
							</Button>
						{/snippet}
					</Rich>
				{/if}
			</p>
		{/if}
	</div>
{/if}
