<script lang="ts">
	import { goto } from "$app/navigation";

	import * as Command from "$lib/components/ui/command";
	import { commandCenterClose } from "../command-center-state.svelte";

	let {
		profileId,
	}: {
		profileId: number | null;
	} = $props();
</script>

<Command.Item
	value={profileId === null ? "#" : `#${profileId}`}
	disabled={profileId === null}
	class={profileId === null ? "text-muted-foreground" : undefined}
	onSelect={() => {
		void goto("/profile/" + profileId);
		commandCenterClose();
	}}
>
	{#if profileId === null}
		Enter the profile ID to search
	{:else}
		#{profileId}
	{/if}
</Command.Item>
