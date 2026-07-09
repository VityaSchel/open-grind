<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import { banInfoSchema, callMethod } from "$lib/api";
	import { accountStatusState } from "$lib/api/account-status-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";

	const status = $derived(accountStatusState.status);

	const content = $derived.by(() => {
		if (status?.kind === "banned") {
			let description = "Grindr has banned this account";
			if (status.info.reason) {
				description += ` (${status.info.reason})`;
			}
			description += ". You can't sign in until the ban is lifted.";
			return {
				title: "Your account is banned",
				description,
			};
		}
		if (status?.kind === "restriction") {
			if (status.restriction.kind === "ageVerification") {
				return {
					title: "Age verification required",
					description:
						"Grindr requires you to verify your age before continuing. Complete it in the official Grindr app, then sign in again. Open Grind does not bypass age verification.",
				};
			}
			return {
				title: "Account restricted",
				description:
					"Your account is currently restricted and can't be used. Check the official Grindr app for details.",
			};
		}
		return { title: "", description: "" };
	});

	onMount(() => {
		const unlisten = listen("auth:banned", (event) => {
			const parsed = banInfoSchema.safeParse(event.payload);
			if (!parsed.success) return;
			accountStatusState.status = { kind: "banned", info: parsed.data };
			accountStatusState.open = true;
		});

		void callMethod("account_restriction")
			.then((restriction) => {
				if (restriction) {
					accountStatusState.status = { kind: "restriction", restriction };
					accountStatusState.open = true;
				}
			})
			.catch(() => {});

		return () => void unlisten.then((fn) => fn());
	});

	let busy = $state(false);

	async function copyDetails() {
		if (status?.kind !== "banned") return;
		try {
			const clipboard = await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(JSON.stringify(status.info, null, 2));
			toast.success("Details copied to clipboard");
		} catch (error) {
			console.error(error);
		}
	}

	async function signOut() {
		busy = true;
		try {
			await callMethod("logout");
		} catch (error) {
			console.error(error);
		} finally {
			busy = false;
			accountStatusState.open = false;
			await goto("/auth/sign-in");
		}
	}
</script>

<AlertDialog.Root bind:open={accountStatusState.open}>
	<AlertDialog.Content
		escapeKeydownBehavior="ignore"
		interactOutsideBehavior="ignore"
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{content.title}</AlertDialog.Title>
			<AlertDialog.Description>{content.description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			{#if status?.kind === "banned"}
				<Button variant="ghost" onclick={copyDetails} disabled={busy}>
					Copy details
				</Button>
			{/if}
			<Button onclick={signOut} disabled={busy}>Sign out</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
