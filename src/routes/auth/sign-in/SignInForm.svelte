<script lang="ts">
	import SiFacebook from "@icons-pack/svelte-simple-icons/icons/SiFacebook";
	import SiGoogle from "@icons-pack/svelte-simple-icons/icons/SiGoogle";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

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
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import { type PlainMessageKey, t } from "$lib/i18n";

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

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | OauthProvider = $state(false);

	const invalidCredentialsSchema = z.object({
		kind: z.literal("Api"),
		message: z.object({
			code: z.literal(4),
			message: z.literal("Invalid input parameters"),
		}),
	});

	const recaptchaErrorSchema = z.object({
		kind: z.literal("Recaptcha"),
		message: z.object({ reason: z.string() }),
	});

	const captchaSignInMessageKeys = {
		unsupportedPlatform: "auth.signIn.captcha.errors.unsupportedPlatform",
		addonUnavailable: "auth.signIn.captcha.errors.addonUnavailable",
		addonDisabled: "auth.signIn.captcha.errors.addonDisabled",
		addonUntrusted: "auth.signIn.captcha.errors.addonUntrusted",
		grindrMissing: "auth.signIn.captcha.errors.grindrMissing",
	} as const satisfies Record<string, PlainMessageKey>;

	type ExplainedCaptchaReason = keyof typeof captchaSignInMessageKeys;

	function isExplainedCaptchaReason(
		reason: string | undefined,
	): reason is ExplainedCaptchaReason {
		return (
			reason !== undefined &&
			Object.hasOwn(captchaSignInMessageKeys, reason)
		);
	}

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = "password";
		try {
			if (await trySignIn()) return;
			await trySignInWithCaptcha();
		} finally {
			submitting = false;
		}
	}

	async function trySignIn(captchaToken?: string): Promise<boolean> {
		try {
			finishSignIn(
				await callMethod("sign_in_with_email", {
					email,
					password,
					captchaToken,
				}),
			);
			return true;
		} catch (error) {
			let invalidCredentials = false;
			reportSignInFailure({
				error,
				onFailure: (appError) => {
					if (
						appError.kind !== "Unauthorized" &&
						!invalidCredentialsSchema.safeParse(appError).success
					) {
						return false;
					}
					invalidCredentials = true;
					return true;
				},
			});
			if (invalidCredentials && captchaToken === undefined) return false;
			if (invalidCredentials) {
				toast.error(t("auth.signIn.errors.invalidCredentials"));
			}
			return true;
		}
	}

	async function trySignInWithCaptcha() {
		let required = false;
		try {
			required = await callMethod("recaptcha_first_party_enabled");
		} catch (error) {
			console.error(
				"[sign-in] failed to check recaptcha_first_party assignment",
				error,
			);
		}
		if (!required) {
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
		toast.error(
			t(
				isExplainedCaptchaReason(reason)
					? captchaSignInMessageKeys[reason]
					: "auth.signIn.captcha.errors.verifyFailed",
			),
		);
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
					const handle = failures[message];
					handle?.();
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
					{t("auth.signUp.title")}
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
