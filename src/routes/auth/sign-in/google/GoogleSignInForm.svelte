<script lang="ts">
	import { page } from "$app/state";
	import { toast } from "svelte-sonner";

	import { googleHandbackState } from "$lib/api/google-handback-state.svelte";
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
	import {
		googleSignInView,
		installButton,
		stageAwaitsUser,
	} from "./google-sign-in-view";

	const COMPANION_RELEASES =
		"https://git.opengrind.org/open-grind/google-oauth-app/releases#install";
	const COMPANION_GUIDE =
		"https://opengrind.org/guides/sign-in-with-google#installed-from-google-play";
	const companionHref = isPlayBuild() ? COMPANION_GUIDE : COMPANION_RELEASES;
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
							"Couldn't find the Open Grind Google OAuth app on your device. Install it first, or paste the OAuth token manually.",
						);
						return true;
					}
					if (message === companionDisabled) {
						toast.error(disabledCompanionMessage);
						return true;
					}
					if (message === companionUntrusted) {
						toast.error(untrustedCompanionMessage);
						pasting = true;
						return true;
					}
					if (message === companionRefused) {
						toast.error(refusedCompanionMessage);
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

{#snippet companionLink()}
	<Link
		href={companionHref}
		class="font-medium text-primary underline underline-offset-2"
	>
		Open Grind Google OAuth app
	</Link>
{/snippet}

{#if googleHandbackState.phase === "signingIn"}
	<Card.Root class="m-auto w-full max-w-sm gap-2">
		<Card.Header>
			<Card.Title>Signing you in</Card.Title>
			<Card.Description>
				Finishing the sign-in from the Google OAuth app.
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
					<Card.Title>Sign in with Google</Card.Title>
					<Card.Description>
						{#if view === "install" && isPlayBuild()}
							Signing in with Google needs the {@render companionLink()}
						{:else if view === "install"}
							Download and install the {@render companionLink()} to
							sign in with Google
						{:else if view === "continue"}
							Continue in the {@render companionLink()} to sign in with
							Google
						{:else}
							<ol class="ms-5 list-decimal">
								<li>Install the {@render companionLink()}</li>
								<li>
									Sign in with Google in the Open Grind Google
									OAuth app and copy the token
								</li>
								<li>
									Return to this screen, paste it and tap
									"Sign in"
								</li>
							</ol>
						{/if}
					</Card.Description>
				</Card.Header>
				{#if view === "paste"}
					<Card.Content>
						<div class="mt-2 grid gap-2">
							<Label for="token">Token</Label>
							<Textarea
								id="token"
								placeholder="Paste your token here"
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
							Continue
						</Button>
					{:else}
						<Button
							type="submit"
							class="w-full"
							disabled={submitting || token.trim().length === 0}
						>
							Sign in
						</Button>
					{/if}
					<Button
						variant="outline"
						class="w-full"
						href="/auth/sign-in"
						disabled={submitting || continuing}
					>
						Go back
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>
		{#if automated}
			<p class="text-center text-sm text-muted-foreground">
				or
				{#if view === "paste"}
					<Button
						variant="link"
						class="h-auto p-0"
						disabled={submitting}
						onclick={() => (pasting = false)}
					>
						use the Open Grind Google OAuth app
					</Button>
				{:else}
					<Button
						variant="link"
						class="h-auto p-0"
						disabled={continuing}
						onclick={() => (pasting = true)}
					>
						paste the OAuth token manually
					</Button>
				{/if}
			</p>
		{/if}
	</div>
{/if}
