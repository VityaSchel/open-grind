<script lang="ts">
	import { EyeSlashIcon } from "phosphor-svelte";

	import { unhideUser } from "$lib/api/browse/hides";
	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import type { PendingViewabilityChange } from "./profile-state.svelte";

	let {
		profileId,
		submitting,
		markViewable,
	}: {
		profileId: number;
		submitting: boolean;
		markViewable: () => PendingViewabilityChange;
	} = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<EyeSlashIcon />
		</Empty.Media>
		<Empty.Title>You hid this profile.</Empty.Title>
		<Empty.Description>
			<Button
				variant="secondary"
				disabled={submitting}
				onclick={async () => {
					const { revert, settle } = markViewable();
					try {
						await unhideUser({ profileId });
						settle();
					} catch (error) {
						revert();
						console.error(error);
						showErrorToast({
							label: "Failed to unhide user",
							error,
						});
					}
				}}>Unhide</Button
			>
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
