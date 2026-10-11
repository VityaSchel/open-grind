<script lang="ts">
	import { goto } from "$app/navigation";

	import * as Command from "$lib/components/ui/command";
	import { t } from "$lib/i18n";
	import { commandCenterClose } from "../command-center-state.svelte";

	let { profileId }: { profileId: number | null } = $props();
</script>

<Command.Item
	value={profileId === null ? "#" : `#${profileId}`}
	disabled={profileId === null}
	class={{ "text-muted-foreground": profileId === null }}
	translate={profileId === null ? undefined : "no"}
	onSelect={() => {
		void goto("/profile/" + profileId);
		commandCenterClose();
	}}
>
	{#if profileId === null}
		{t("commands.openProfileById.hint")}
	{:else}
		#{profileId}
	{/if}
</Command.Item>
