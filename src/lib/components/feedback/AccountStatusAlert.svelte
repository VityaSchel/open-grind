<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { onMount } from "svelte";

	import {
		accountStatusState,
		showAccountRestriction,
	} from "$lib/api/account-status-state.svelte";
	import { copyToClipboard } from "$lib/api/error-copy";
	import {
		banInfoSchema,
		callMethod,
		restrictionSchema,
	} from "$lib/api/methods";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	const status = $derived(accountStatusState.status);

	const content = $derived.by(() => {
		if (status?.kind === "banned") {
			const { reason } = status.info;
			return {
				title: t("feedback.accountStatus.banned.title"),
				description: reason
					? t("feedback.accountStatus.banned.descriptionWithReason", {
							reason,
						})
					: t("feedback.accountStatus.banned.description"),
			};
		}
		if (status?.kind === "restriction") {
			if (status.restriction.kind === "ageVerification") {
				return {
					title: t("feedback.accountStatus.ageVerification.title"),
					description: t(
						"feedback.accountStatus.ageVerification.description",
					),
				};
			}
			return {
				title: t("feedback.accountStatus.restricted.title"),
				description: t("feedback.accountStatus.restricted.description"),
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

	let signingOut = $state(false);

	dismissOnBackGesture({
		active: () => accountStatusState.open,
		dismiss: () => {},
	});

	function copyDetails() {
		if (status?.kind !== "banned") return;
		void copyToClipboard({ text: JSON.stringify(status.info, null, 2) });
	}

	async function onSignOut() {
		signingOut = true;
		try {
			await signOut();
		} finally {
			signingOut = false;
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
			<fieldset disabled={signingOut} class="contents">
				{#if status?.kind === "banned"}
					<Button variant="ghost" onclick={copyDetails}>
						{t("feedback.accountStatus.banned.copyDetails")}
					</Button>
				{/if}
				<Button onclick={onSignOut} aria-busy={signingOut}>
					{#if signingOut}
						<Spinner aria-hidden="true" />
					{/if}
					{t("feedback.actions.signOut")}
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
