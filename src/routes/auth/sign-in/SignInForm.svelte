<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import {
		accountStatusState,
		showAccountRestriction,
	} from "$lib/api/account-status-state.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		asAppError,
		asBanned,
		blockedKindOf,
		callMethod,
		markRequestBlocked,
	} from "$lib/api/methods";
	import { clearProfileCaches } from "$lib/api/users/profiles";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Spinner } from "$lib/components/ui/spinner";
	import RecaptchaUnsupported from "./RecaptchaUnsupported.svelte";

	let email = $state("");
	let password = $state("");
	let submitting: false | "password" | "google" = $state(false);

	function handleAccountBlock(error: unknown): boolean {
		const ban = asBanned(error);
		if (ban) {
			accountStatusState.status = { kind: "banned", info: ban };
			accountStatusState.open = true;
			return true;
		}
		if (asAppError(error)?.kind === "RateLimited") {
			toast.error("Too many attempts. Please try again later.");
			return true;
		}
		return false;
	}

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		submitting = "password";
		try {
			const result = await callMethod("login", { email, password });
			if (showAccountRestriction(result.restriction)) return;
			clearProfileCaches();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			const blockedKind = blockedKindOf(appError?.kind);
			if (blockedKind && markRequestBlocked({ kind: blockedKind })) {
				return;
			}
			if (handleAccountBlock(error)) return;
			if (appError) {
				const invalidInputParameters = z
					.object({
						kind: z.literal("Api"),
						message: z.object({
							code: z.literal(4),
							message: z.literal("Invalid input parameters"),
						}),
					})
					.safeParse(appError).success;
				if (
					invalidInputParameters ||
					appError.kind === "Unauthorized"
				) {
					toast.error("Invalid email or password");
					void maybeCheckRecaptcha();
				} else {
					toast.error(appError.prettyMessage);
				}
			} else {
				showErrorToast({ error });
			}
		} finally {
			submitting = false;
		}
	}

	let recaptchaChecked = false;
	let recaptchaDialogOpen = $state(false);

	async function maybeCheckRecaptcha() {
		if (recaptchaChecked) return;
		recaptchaChecked = true;
		try {
			const enabled = await callMethod("recaptcha_first_party_enabled");
			if (enabled) recaptchaDialogOpen = true;
		} catch (error) {
			console.error(
				"[login] failed to check recaptcha_first_party assignment",
				error,
			);
		}
	}

	async function signInWithGoogle() {
		if (submitting) return;
		submitting = "google";
		try {
			const result = await callMethod("login_with_google");
			if (showAccountRestriction(result.restriction)) return;
			clearProfileCaches();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			const blockedKind = blockedKindOf(appError?.kind);
			if (blockedKind && markRequestBlocked({ kind: blockedKind })) {
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "companion-unavailable"
			) {
				void goto("/auth/sign-in/google");
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "companion-untrusted"
			) {
				toast.error(
					"An app using the companion's name is installed but isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.",
				);
				void goto("/auth/sign-in/google");
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "Sign-in canceled"
			) {
				return;
			}
			if (handleAccountBlock(error)) return;
			if (appError) {
				toast.error(appError.prettyMessage);
			} else {
				toast.error("Google sign-in failed");
			}
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
			>
				{#if submitting === "password"}
					<Spinner />
				{/if}
				Sign in
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={submitting !== false}
				onclick={signInWithGoogle}
			>
				{#if submitting === "google"}
					<Spinner />
				{/if}
				Sign in with Google
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
<RecaptchaUnsupported bind:open={recaptchaDialogOpen} />
