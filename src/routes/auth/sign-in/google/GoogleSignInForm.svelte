<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import { asAppError, callMethod } from "$lib/api";
	import { showErrorToast } from "$lib/api/error";
	import { clearProfileCaches } from "$lib/api/users/profiles";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { Textarea } from "$lib/components/ui/textarea";

	let token = $state("");
	let submitting = $state(false);
	let retrying = $state(false);

	let manualInput = $state(false);

	async function retry() {
		if (retrying) return;
		retrying = true;
		try {
			await callMethod("login_with_google");
			clearProfileCaches();
			void goto("/");
		} catch (error) {
			const appError = asAppError(error);
			if (
				appError?.kind === "Auth" &&
				appError.message === "companion-unavailable"
			) {
				toast.error(
					'Couldn\'t find Open Grind Google OAuth app on your device. Install it first, then tap "Retry". Alternatively, try pasting the OAuth token manually.',
				);
				return;
			}
			if (
				appError?.kind === "Auth" &&
				appError.message === "Sign-in cancelled"
			) {
				return;
			}
			console.error(error);
			if (appError) {
				toast.error(appError.prettyMessage);
			} else {
				showErrorToast({ error });
			}
		} finally {
			retrying = false;
		}
	}
</script>

<form
	onsubmit={async (event) => {
		event.preventDefault();
		try {
			submitting = true;
			await callMethod("google_sign_in", { token: token.trim() });
			clearProfileCaches();
			void goto("/");
		} catch (error) {
			console.error(error);
			const appError = asAppError(error);
			if (appError) {
				toast.error(appError.prettyMessage);
			} else {
				showErrorToast({ error });
			}
		} finally {
			submitting = false;
		}
	}}
	class="contents"
>
	<Card.Root class="m-auto w-full max-w-sm gap-2">
		<Card.Header>
			<Card.Title>Sign in with Google</Card.Title>
			<Card.Description>
				<ol class="ms-5 list-decimal">
					<li>
						Install <Link
							href="https://git.opengrind.org/open-grind/open-grind-google-oauth-android-app"
							class="font-medium text-primary underline underline-offset-2"
						>
							Open Grind companion app
						</Link>
					</li>
					{#if !manualInput}
						<li>On this screen tap "Retry" button</li>
					{:else}
						<li>Sign in with Google in the companion app and copy the token</li>
						<li>Return to this screen, paste it and tap "Sign in"</li>
					{/if}
				</ol>
				{#if !manualInput}
					<div class="my-2 block text-center">
						or <Button
							variant="secondary"
							size="xs"
							disabled={retrying}
							onclick={() => (manualInput = true)}
						>
							paste the OAuth token manually
						</Button>
					</div>
				{/if}
			</Card.Description>
		</Card.Header>
		{#if manualInput}
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
			{#if manualInput}
				<Button
					type="submit"
					class="w-full"
					disabled={submitting || token.trim().length === 0}
				>
					Sign in
				</Button>
			{:else}
				<Button
					type="button"
					class="w-full"
					disabled={retrying}
					onclick={retry}
				>
					{#if retrying}
						<Spinner />
					{/if}
					Retry
				</Button>
			{/if}
			<Button
				variant="outline"
				class="w-full"
				href="/auth/sign-in"
				disabled={submitting || retrying}
			>
				Go back
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
