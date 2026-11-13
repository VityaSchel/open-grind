<script lang="ts">
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";

	import * as Alert from "#lib/components/ui/alert/index.ts";
	import type { RightNowPostRejection } from "../right-now-post-state.svelte";

	let { rejected }: { rejected: RightNowPostRejection } = $props();

	const title = $derived.by(() => {
		if (rejected.text && rejected.photo)
			return "Your text and photo were rejected";
		if (rejected.photo) return "Your photo was rejected";
		return "Your text was rejected";
	});
</script>

<Alert.Root variant="destructive">
	<WarningCircleIcon weight="fill" />
	<Alert.Title>{title}</Alert.Title>
	<Alert.Description>
		{#if rejected.reasons.length > 0}
			<ul class="list-disc ps-4">
				{#each rejected.reasons as reason (reason)}
					<li>{reason}</li>
				{/each}
			</ul>
		{:else}
			No reason was given.
		{/if}
	</Alert.Description>
</Alert.Root>
