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
	import { Textarea } from "$lib/components/ui/textarea";

	let token = $state("");
	let submitting = $state(false);

	let manualInput = $state(false);
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
						<li>
							On this screen tap "Go back" button, then "Sign in with Google"
							again
						</li>
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
				<div class="grid gap-2 mt-2">
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
			{/if}
			<Button
				variant="outline"
				class="w-full"
				href="/auth/sign-in"
				disabled={submitting}
			>
				Go back
			</Button>
		</Card.Footer>
	</Card.Root>
</form>
