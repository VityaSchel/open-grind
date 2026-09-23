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
					toast.error(disabledCompanionMessage),
				[companionUntrusted]: () => {
					toast.error(untrustedCompanionMessage);
					void goto("/auth/sign-in/google?paste");
				},
				[companionRefused]: () => {
					toast.error(refusedCompanionMessage);
					void goto("/auth/sign-in/google?paste");
				},
			},
		},
		facebook: {
			method: "sign_in_with_facebook",
			label: "Facebook",
			failures: {
				"facebook-dialog-error": () =>
					toast.error(
						"Facebook didn't grant access. Try again, or sign in with your email and password.",
					),
				"facebook-handoff-refused": () =>
					toast.error(
						"Facebook tried to open its own app, which Open Grind can't use. Sign in with your email and password instead.",
					),
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

	const captchaSignInMessages: Record<string, string> = {
		unsupportedPlatform:
			"This account needs captcha verification, available through the Open Grind reCAPTCHA helper on Android.",
		addonUnavailable:
			"Install the Open Grind reCAPTCHA helper to sign in to this account.",
		addonDisabled:
			"Enable the Open Grind reCAPTCHA helper to sign in to this account.",
		addonUntrusted:
			"The installed reCAPTCHA helper isn't the official Open Grind build.",
		grindrMissing:
			"The reCAPTCHA helper needs the Grindr app installed to verify this sign-in.",
	};

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
			if (invalidCredentials) toast.error("Invalid email or password");
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
			toast.error("Invalid email or password");
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
			(reason ? captchaSignInMessages[reason] : undefined) ??
				"Captcha verification failed. Try again.",
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
				label: `${label} sign-in failed`,
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
			<Card.Title>Sign in to your account</Card.Title>
			<Card.Description>
				Enter your email below to sign in to your account
			</Card.Description>
			<Card.Action>
				<Button variant="link" href="/auth/sign-up" class="px-0">
					Sign Up
				</Button>
			</Card.Action>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-6">
				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						type="email"
						placeholder="m@example.com"
						required
						bind:value={email}
						disabled={submitting !== false}
					/>
				</div>
				<div class="grid gap-2">
					<div class="flex items-center">
						<Label for="password">Password</Label>
						<a
							href="/auth/password-reset"
							class="ms-auto inline-block text-sm underline-offset-4 hover:underline"
						>
							Forgot your password?
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
				Sign in
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
				Sign in with Google
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
				Sign in with Facebook
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
