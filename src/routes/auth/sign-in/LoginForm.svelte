<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import z from "zod";

	import { asAppError, callMethod } from "$lib/api";
	import { showErrorToast } from "$lib/api/error";
	import { clearProfileCaches } from "$lib/api/users/profiles";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";

	let email = $state("");
	let password = $state("");
	let submitting = $state(false);

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

	let googleSubmitting = $state(false);

	async function signInWithGoogle() {
		if (googleSubmitting || submitting) return;
		try {
			googleSubmitting = true;
			await callMethod("login_with_google");
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			if (appError) {
				if (
					!(
						appError.kind === "Auth" && appError.message === "Sign-in cancelled"
					)
				) {
					toast.error(appError.prettyMessage);
				}
			} else {
				toast.error("Google sign-in failed");
			}
		} finally {
			googleSubmitting = false;
		}
	}
</script>

<form
	onsubmit={async (event) => {
		event.preventDefault();
		try {
			submitting = true;
			await callMethod("login", {
				email,
				password,
			});
			clearProfileCaches();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
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
				if (invalidInputParameters || appError.kind === "Unauthorized") {
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
	}}
	class="contents"
>
	<Card.Root class="w-full max-w-sm m-auto">
		<Card.Header>
			<Card.Title>Login to your account</Card.Title>
			<Card.Description>
				Enter your email below to login to your account
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
						disabled={submitting}
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
						disabled={submitting}
					/>
				</div>
			</div>
		</Card.Content>
		<Card.Footer class="flex-col gap-2">
			<Button
				type="submit"
				class="w-full"
				disabled={submitting || googleSubmitting}
			>
				Login
			</Button>
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={submitting || googleSubmitting}
				onclick={signInWithGoogle}
			>
				{googleSubmitting ? "Signing in…" : "Login with Google"}
			</Button>
		</Card.Footer>
	</Card.Root>
</form>

<AlertDialog.Root bind:open={recaptchaDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Captcha verification required</AlertDialog.Title>
			<AlertDialog.Description>
				Grindr requires captcha verification for your device or account, which
				Open Grind does not currently support. <Link
					href="https://git.opengrind.org/open-grind/open-grind/issues/129"
				>
					Follow for updates on issue #129
				</Link>.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Action>OK</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
