<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		accountStatusState,
		showAccountRestriction,
	} from "$lib/api/account-status-state.svelte";
	import {
		banInfoSchema,
		callMethod,
		restrictionSchema,
	} from "$lib/api/methods";
	import { signOut } from "$lib/api/sign-out";
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
			return { title: "Your account is banned", description };
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
		const unlistenBanned = listen("auth:banned", (event) => {
			const parsed = banInfoSchema.safeParse(event.payload);
			if (!parsed.success) return;
			accountStatusState.status = { kind: "banned", info: parsed.data };
			accountStatusState.open = true;
		});
		const unlistenRestriction = listen("auth:restriction", (event) => {
			const parsed = restrictionSchema.safeParse(event.payload);
			if (!parsed.success) return;
			showAccountRestriction(parsed.data);
		});

		void callMethod("account_restriction")
			.then(showAccountRestriction)
			.catch(() => {});

		return () => {
			void unlistenBanned.then((fn) => fn());
			void unlistenRestriction.then((fn) => fn());
		};
	});

	let busy = $state(false);

	async function copyDetails() {
		if (status?.kind !== "banned") return;
		try {
			const clipboard =
				await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(JSON.stringify(status.info, null, 2));
			toast.success("Details copied to clipboard");
		} catch (error) {
			console.error(error);
		}
	}

	async function onSignOut() {
		busy = true;
		try {
			await signOut();
		} finally {
			busy = false;
			accountStatusState.open = false;
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
			<AlertDialog.Description
				>{content.description}</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			{#if status?.kind === "banned"}
				<Button variant="ghost" onclick={copyDetails} disabled={busy}>
					Copy details
				</Button>
			{/if}
			<Button onclick={onSignOut} disabled={busy}>Sign out</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
