<script lang="ts">
	import { ProhibitIcon } from "phosphor-svelte";

	import { unblockUser } from "$lib/api/browse/blocks";
	import { showErrorToast } from "$lib/api/error-toast";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import type { PendingViewabilityChange } from "./profile-state.svelte";

	let {
		profileId,
		blockedByUs,
		submitting,
		markViewable,
	}: {
		profileId: number;
		blockedByUs: boolean;
		submitting: boolean;
		markViewable: () => PendingViewabilityChange;
	} = $props();
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
						const { revert, settle } = markViewable();
						try {
							await unblockUser({ profileId });
							settle();
						} catch (error) {
							revert();
							console.error(error);
							showErrorToast({
								label: "Failed to unblock user",
								error,
							});
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
