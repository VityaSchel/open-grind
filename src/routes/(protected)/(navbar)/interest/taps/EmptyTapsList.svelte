<script lang="ts">
	import FireIcon from "phosphor-svelte/lib/FireIcon";

	import CandyIcon from "$lib/components/halloween/CandyIcon.svelte";
	import { isHalloween } from "$lib/components/halloween/halloween";
	import * as Empty from "$lib/components/ui/empty";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			{#if isHalloween()}
				<CandyIcon />
			{:else}
				<FireIcon weight="fill" />
			{/if}
		</Empty.Media>
		<Empty.Title>No Taps Yet</Empty.Title>
		<Empty.Description>
			Browse <a href="/">Grid</a> to find people, and they might tap you back.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
