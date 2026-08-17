<script lang="ts">
	import { toast } from "svelte-sonner";

	import { callMethod } from "$lib/api/methods";
	import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import Link from "$lib/components/ui/link/Link.svelte";

	let submitting = $state(false);

	const cloudflare = $derived(requestBlockedAlertState.kind === "cloudflare");

	const copy = $derived.by(() => {
		if (cloudflare) {
			return {
				title: "Grindr blocks your requests",
				description:
					"Cloudflare protecting the Grindr API is currently blocking your requests because of suspicious activity.",
				advice: "You can also rotate request parameters using the button below.",
			};
		}
		return {
			title: "Something blocked the request before it reached Grindr",
			description:
				"A VPN, DNS filter, captive portal, or a school or work network may have answered instead of Grindr, or an edge in front of the Grindr API turned the request away.",
			advice: "Otherwise, switch to another network, or rotate request parameters using the button below.",
		};
	});
</script>

<AlertDialog.Root bind:open={requestBlockedAlertState.open}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{copy.title}</AlertDialog.Title>
			<AlertDialog.Description>
				{copy.description}
				{#if cloudflare}
					This is a <Link
						href="https://git.opengrind.org/open-grind/open-grind/issues/81"
					>
						known issue
					</Link>.
				{/if}
				<span class="font-semibold"
					>If you use a VPN, try disabling it.</span
				>
				{copy.advice}
				<div class="mt-4 flex items-center gap-3 text-left">
					<Checkbox
						id="disable-request-blocked-alert"
						bind:checked={requestBlockedAlertState.disable}
					/>
					<Label
						for="disable-request-blocked-alert"
						class="leading-5"
					>
						Don't show again in this session</Label
					>
				</div>
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={submitting}>Close</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={async () => {
					submitting = true;
					try {
						await callMethod("rotate_api_params");
						toast.success(
							"Successfully rotated device parameters",
							{ id: "rotate-api-params-success" },
						);
					} catch (error) {
						console.error(error);
					} finally {
						submitting = false;
						requestBlockedAlertState.open = false;
					}
				}}
				disabled={submitting}
			>
				Rotate parameters
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
