<script lang="ts">
	import { ProhibitIcon } from "phosphor-svelte";

	import { unblockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";

	let {
		profileId,
		blockedByUs,
		onRefresh,
	}: { profileId: number; blockedByUs: boolean; onRefresh: () => void } =
		$props();

	let submitting = $state(false);
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ProhibitIcon />
		</Empty.Media>
		<Empty.Title>
			{#if blockedByUs}
				You have blocked this profile.
			{:else}
				This person has blocked you.
			{/if}
		</Empty.Title>
		<Empty.Description>
			{#if blockedByUs}
				<Button
					variant="secondary"
					disabled={submitting}
					onclick={async () => {
						if (submitting) return;
						submitting = true;
						try {
							await unblockUser({ profileId });
							onRefresh();
						} catch (error) {
							console.error(error);
							showErrorToast({
								label: "Failed to unblock user",
								error,
							});
						} finally {
							submitting = false;
						}
					}}>Unblock</Button
				>
			{:else}
				If you know this is a bug in the app, <Link
					href="https://git.opengrind.org/open-grind/open-grind/issues/new?template=.forgejo%2fissue_template%2fbug.yaml"
					target="_blank">report an issue</Link
				>.
			{/if}
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
