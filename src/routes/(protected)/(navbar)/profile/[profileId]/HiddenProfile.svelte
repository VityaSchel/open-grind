<script lang="ts">
	import { EyeSlashIcon } from "phosphor-svelte";

	import { unhideUser } from "$lib/api/browse/hides";
	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";

	let { profileId, onRefresh }: { profileId: number; onRefresh: () => void } =
		$props();

	let submitting = $state(false);
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
					if (submitting) return;
					submitting = true;
					try {
						await unhideUser({ profileId });
						onRefresh();
					} catch (error) {
						console.error(error);
						showErrorToast({
							label: "Failed to unhide user",
							error,
						});
					} finally {
						submitting = false;
					}
				}}>Unhide</Button
			>
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
