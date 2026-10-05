<script lang="ts">
	import { toast } from "svelte-sonner";

	import { callMethod } from "$lib/api/methods";
	import {
		requestBlockedAlertState,
		type RequestBlockKind,
	} from "$lib/api/request-blocked-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { type MessageKey, t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";

	const copyKeys = {
		cloudflare: {
			title: "feedback.requestBlocked.cloudflare.title",
			description: "feedback.requestBlocked.cloudflare.description",
			advice: "feedback.requestBlocked.cloudflare.advice",
		},
		network: {
			title: "feedback.requestBlocked.network.title",
			description: "feedback.requestBlocked.network.description",
			advice: "feedback.requestBlocked.network.advice",
		},
	} as const satisfies Record<
		RequestBlockKind,
		Record<"title" | "description" | "advice", MessageKey>
	>;

	let submitting = $state(false);

	const cloudflare = $derived(requestBlockedAlertState.kind === "cloudflare");

	const copy = $derived(copyKeys[requestBlockedAlertState.kind]);
</script>

<AlertDialog.Root bind:open={requestBlockedAlertState.open}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{t(copy.title)}</AlertDialog.Title>
			<AlertDialog.Description>
				{t(copy.description)}
				{#if cloudflare}
					<Rich key="feedback.requestBlocked.cloudflare.knownIssue">
						{#snippet link(text)}<Link
								href="https://git.opengrind.org/open-grind/open-grind/issues/81"
								>{text}</Link
							>{/snippet}
					</Rich>
				{/if}
				<span class="font-semibold"
					>{t("feedback.requestBlocked.vpnHint")}</span
				>
				{t(copy.advice)}
				<div class="mt-4 flex items-center gap-3 text-left">
					<Checkbox
						id="disable-request-blocked-alert"
						bind:checked={requestBlockedAlertState.disable}
					/>
					<Label
						for="disable-request-blocked-alert"
						class="leading-5"
					>
						{t("feedback.requestBlocked.dontShowAgain")}</Label
					>
				</div>
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={submitting}
				>{t("common.actions.close")}</AlertDialog.Cancel
			>
			<AlertDialog.Action
				onclick={async () => {
					submitting = true;
					try {
						await callMethod("rotate_api_params");
						toast.success(t("feedback.requestBlocked.rotated"), {
							id: "rotate-api-params-success",
						});
					} catch (error) {
						console.error(error);
					} finally {
						submitting = false;
						requestBlockedAlertState.open = false;
					}
				}}
				disabled={submitting}
			>
				{t("feedback.requestBlocked.rotate")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
