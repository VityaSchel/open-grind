<script lang="ts">
	import { ChatCircleSlashIcon, FunnelIcon } from "phosphor-svelte";

	import * as Empty from "$lib/components/ui/empty";

	let { filtered = false }: { filtered?: boolean } = $props();

	const Icon = $derived(filtered ? FunnelIcon : ChatCircleSlashIcon);
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight="fill" />
		</Empty.Media>
		{#if filtered}
			<Empty.Title>No Results</Empty.Title>
			<Empty.Description>
				No conversations match these filters.
			</Empty.Description>
		{:else}
			<Empty.Title>No Conversations Yet</Empty.Title>
			<Empty.Description>
				Browse <a href="/">Grid</a> to find people to chat with.
			</Empty.Description>
		{/if}
	</Empty.Header>
</Empty.Root>
