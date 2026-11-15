<script lang="ts">
	import SiFacebook from "@icons-pack/svelte-simple-icons/icons/SiFacebook";
	import SiGoogle from "@icons-pack/svelte-simple-icons/icons/SiGoogle";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { callMethod } from "#lib/api/methods.ts";
	import {
		companionDisabled,
		companionRefused,
		companionUnavailable,
		companionUntrusted,
		disabledCompanionMessage,
		finishSignIn,
		refusedCompanionMessage,
		reportSignInFailure,
		signInFlowEnded,
		signInInProgress,
		untrustedCompanionMessage,
	} from "#lib/api/sign-in.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Card from "#lib/components/ui/card/index.ts";
	import { Input } from "#lib/components/ui/input/index.ts";
	import { Label } from "#lib/components/ui/label/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { openExternalLink } from "#lib/platform/link-opener.ts";
	import {
		addonInstallerAvailable,
		addonPublishedHere,
		recaptchaUpdates,
	} from "#lib/updates/addon.svelte.ts";
	import { RECAPTCHA_COMPONENT } from "#lib/updates/components.ts";
	import {
		manualInstallHref,
		RECAPTCHA_HELPER_GUIDE,
	} from "#lib/updates/manual-install.ts";
	import RecaptchaHelperDialog from "./RecaptchaHelperDialog.svelte";

	type OauthProvider = "google" | "facebook";

	const oauthProviders: Record<
		OauthProvider,
		{
			method: "sign_in_with_google" | "sign_in_with_facebook";
			label: string;
			failures: Record<string, () => void>;
		}
	> = {
		google: {
			method: "sign_in_with_google",
			label: "Google",
			failures: {
				[companionUnavailable]: () => void goto("/auth/sign-in/google"),
				[companionDisabled]: () =>
					toast.error(disabledCompanionMessage()),
				[companionUntrusted]: () => {
					toast.error(untrustedCompanionMessage());
					void goto("/auth/sign-in/google?paste");
				},
				[companionRefused]: () => {
					toast.error(refusedCompanionMessage());
					void goto("/auth/sign-in/google?paste");
				},
			},
		},
		facebook: {
			method: "sign_in_with_facebook",
			label: "Facebook",
			failures: {
				"facebook-dialog-error": () =>
					toast.error(t("auth.signIn.facebook.errors.dialogError")),
				"facebook-handoff-refused": () =>
					toast.error(
						t("auth.signIn.facebook.errors.handoffRefused"),
					),
				"facebook-unverified": () =>
					toast.error(t("auth.signIn.facebook.errors.unverified")),
				"facebook-timed-out": () =>
					toast.error(t("auth.signIn.facebook.errors.timedOut")),
			},
		},
	};

	const flowFailures: Record<string, (label: string) => void> = {
		[signInInProgress]: (label) =>
			toast.error(
				t("auth.signIn.errors.inProgress", { provider: label }),
			),
		[signInFlowEnded]: () => toast.error(t("auth.signIn.errors.flowEnded")),
	};

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | OauthProvider = $state(false);

	const refusedCredentialsSchema = z.union([
		z.object({ kind: z.literal("Unauthorized") }),
		z.object({
			kind: z.literal("Api"),
			message: z.object({
				code: z.literal(4),
				message: z.literal("Invalid input parameters"),
			}),
		}),
	]);

	const rejectedCaptchaSchema = z.object({
		kind: z.literal("Api"),
		message: z.object({ code: z.literal(18) }),
	});

	const recaptchaErrorSchema = z.object({
		kind: z.literal("Recaptcha"),
		message: z.object({ reason: z.string() }),
	});

	const captchaGuideMessageKeys = {
		unsupportedPlatform:
			"auth.signIn.captcha.errors.credentialsOrUnsupportedPlatform",
		grindrMissing: "auth.signIn.captcha.errors.grindrMissing",
	} as const satisfies Record<string, PlainMessageKey>;

	const captchaSignInMessageKeys = {
		addonDisabled: "auth.signIn.captcha.errors.addonDisabled",
		addonUntrusted: "auth.signIn.captcha.errors.addonUntrusted",
	} as const satisfies Record<string, PlainMessageKey>;

	function captchaMessageKey(
		keys: Readonly<Record<string, PlainMessageKey>>,
		reason: string | undefined,
	): PlainMessageKey | undefined {
		return reason !== undefined && Object.hasOwn(keys, reason)
			? keys[reason]
			: undefined;
	}

	let helperDialog: "install" | "manual" | null = $state(null);

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = "password";
		try {
			const refusal = await trySignIn();
			if (refusal) await trySignInWithCaptcha(refusal);
		} finally {
			submitting = false;
		}
	}

	type Refusal = "credentials" | "captcha";

	const refusalAfterCaptchaMessageKeys = {
		captcha: "auth.signIn.captcha.errors.rejected",
		credentials: "auth.signIn.captcha.errors.credentialsOrRejected",
	} as const satisfies Record<Refusal, PlainMessageKey>;

	function refusalOf(error: unknown): Refusal | null {
		if (rejectedCaptchaSchema.safeParse(error).success) return "captcha";
		if (refusedCredentialsSchema.safeParse(error).success)
			return "credentials";
		return null;
	}

	async function trySignIn(captchaToken?: string): Promise<Refusal | null> {
		try {
			finishSignIn(
				await callMethod("sign_in_with_email", {
					email,
					password,
					captchaToken,
				}),
			);
			return null;
		} catch (error) {
			const refusal = refusalOf(error);
			reportSignInFailure({ error, onFailure: () => refusal !== null });
			if (refusal === null || captchaToken === undefined) return refusal;
			showCaptchaGuideToast(refusalAfterCaptchaMessageKeys[refusal]);
			return null;
		}
	}

	async function captchaAssigned(): Promise<boolean> {
		try {
			return await callMethod("recaptcha_first_party_enabled");
		} catch (error) {
			console.error(
				"[sign-in] failed to check recaptcha_first_party assignment",
				error,
			);
			return false;
		}
	}

	async function trySignInWithCaptcha(refusal: Refusal) {
		if (refusal === "credentials" && !(await captchaAssigned())) {
			toast.error(t("auth.signIn.errors.invalidCredentials"));
			return;
		}
		try {
			const captchaToken = await callMethod("mint_recaptcha_token", {
				action: "login",
			});
			await trySignIn(captchaToken);
		} catch (error) {
			reportCaptchaFailure(error);
		}
	}

	function reportCaptchaFailure(error: unknown) {
		const parsed = recaptchaErrorSchema.safeParse(error);
		const reason = parsed.success ? parsed.data.message.reason : undefined;
		if (reason === "cancelled") return;
		if (reason === "addonUnavailable") {
			helperDialog = addonInstallerAvailable() ? "install" : "manual";
			return;
		}
		const guided = captchaMessageKey(captchaGuideMessageKeys, reason);
		if (guided) {
			showCaptchaGuideToast(guided);
			return;
		}
		toast.error(
			t(
				captchaMessageKey(captchaSignInMessageKeys, reason) ??
					"auth.signIn.captcha.errors.verifyFailed",
			),
		);
	}

	function showCaptchaGuideToast(message: PlainMessageKey) {
		toast.error(t(message), {
			action: {
				label: t("common.actions.learnMore"),
				onClick: () => openExternalLink(RECAPTCHA_HELPER_GUIDE),
			},
		});
	}

	async function continueToHelper() {
		const installable = helperDialog === "install";
		helperDialog = null;
		if (installable && (await addonPublishedHere(RECAPTCHA_COMPONENT))) {
			await recaptchaUpdates.installNow();
			return;
		}
		openExternalLink(manualInstallHref(RECAPTCHA_COMPONENT));
	}

	async function signInWith(provider: OauthProvider) {
		if (submitting) return;
		submitting = provider;
		const { method, label, failures } = oauthProviders[provider];
		try {
			finishSignIn(await callMethod(method));
		} catch (error) {
			reportSignInFailure({
				error,
				label: t("auth.signIn.errors.providerFailed", {
					provider: label,
				}),
				onAuthFailure: (message) => {
					const handle = failures[message] ?? flowFailures[message];
					handle?.(label);
					return handle !== undefined;
				},
			});
		} finally {
			submitting = false;
		}
	}
</script>

<form onsubmit={signIn} class="contents">
	<Card.Root class="m-auto w-full max-w-sm">
		<Card.Header>
			<Card.Title>{t("auth.signIn.heading")}</Card.Title>
			<Card.Description>
				{t("auth.signIn.description")}
			</Card.Description>
			<Card.Action>
				<Button variant="link" href="/auth/sign-up" class="px-0">
					{t("auth.signIn.signUp")}
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-6">
				<div class="grid gap-2">
					<Label for="email">{t("auth.signIn.email.label")}</Label>
					<Input
						id="email"
						type="email"
						placeholder={t("auth.signIn.email.placeholder")}
						required
						autocomplete="username"
						bind:value={email}
						disabled={submitting !== false}
					/>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center">
						<Label for="password"
							>{t("auth.signIn.password.label")}</Label
						>
						<a
							href="/auth/password-reset"
							class="ms-auto inline-block text-sm underline-offset-4 hover:underline"
						>
							{t("auth.signIn.forgotPassword")}
						</a>
					</div>
					<Input
						id="password"
						type="password"
						required
						autocomplete="current-password"
						bind:value={password}
						disabled={submitting !== false}
					/>
				</div>
			</div>
		</Card.Content>
		<Card.Footer class="flex-col gap-2">
			<Button
				type="submit"
				class="w-full"
				disabled={submitting !== false}
				aria-busy={submitting === "password"}
			>
				{#if submitting === "password"}
					<Spinner aria-hidden="true" />
				{/if}
				{t("auth.signIn.submit")}
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={submitting !== false}
				aria-busy={submitting === "google"}
				onclick={() => signInWith("google")}
			>
				{#if submitting === "google"}
					<Spinner aria-hidden="true" />
				{:else}
					<SiGoogle class="size-4" aria-hidden="true" />
				{/if}
				{t("auth.signIn.withGoogle")}
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={submitting !== false}
				aria-busy={submitting === "facebook"}
				onclick={() => signInWith("facebook")}
			>
				{#if submitting === "facebook"}
					<Spinner aria-hidden="true" />
				{:else}
					<SiFacebook class="size-4" aria-hidden="true" />
				{/if}
				{t("auth.signIn.withFacebook")}
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
<RecaptchaHelperDialog
	bind:open={
		() => helperDialog !== null,
		(next) => {
			if (!next) helperDialog = null;
		}
	}
	onContinue={() => void continueToHelper()}
/>
