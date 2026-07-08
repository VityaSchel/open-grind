<script lang="ts">
	import {
		FunnelIcon,
		MagnifyingGlassIcon,
		MapPinIcon,
		UserIcon,
	} from "phosphor-svelte";
	import { onMount } from "svelte";
	import { tinykeys } from "tinykeys";

	import OpenProfileByIdCommand from "$lib/components/command-center/open-profile-by-id/OpenProfileByIdCommand.svelte";
	import SetLocationByGeohashCommand from "$lib/components/command-center/set-location-by-geohash/SetLocationByGeohashCommand.svelte";
	import * as Command from "$lib/components/ui/command";
	import {
		commandCenterClose,
		commandCenterState,
	} from "./command-center-state.svelte";
	import CommandSuggestion from "./CommandSuggestion.svelte";
	import FilterGridCommand from "./filter-grid/FilterGridCommand.svelte";
	import QuickGoToCommandGroup from "./quick-go-to/QuickGoToCommandGroup.svelte";

	onMount(() => {
		return tinykeys(window, {
			"$mod+k": (event) => {
				event.preventDefault();
				commandCenterState.open = true;
			},
		});
	});
</script>

<Command.Dialog
	bind:open={
		() => commandCenterState.open,
		(newValue) => {
			if (newValue === true) {
				commandCenterState.open = true;
			} else {
				commandCenterClose();
			}
		}
	}
	bind:value={commandCenterState.value}
	class="max-xs:max-w-full"
>
	<Command.Root
		class="w-full p-3.5"
		shouldFilter={commandCenterState.query.length > 0}
	>
		<Command.Input
			placeholder="Quick actions..."
			bind:value={commandCenterState.query}
		/>
		<Command.List class="mt-2">
			<Command.Empty class="text-muted-foreground">
				Unknown command
			</Command.Empty>
			{#if commandCenterState.query.length === 0}
				<Command.Group heading="Suggestions">
					<CommandSuggestion prefix="#" command="open profile by id">
						{#snippet icon()}
							<UserIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion prefix="?" command="filter grid">
						{#snippet icon()}
							<FunnelIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion prefix="/" command="quick go to">
						{#snippet icon()}
							<MagnifyingGlassIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion prefix="@" command="set location by geohash">
						{#snippet icon()}
							<MapPinIcon />
						{/snippet}
					</CommandSuggestion>
				</Command.Group>
			{/if}
			{#if commandCenterState.query.startsWith("#")}
				<OpenProfileByIdCommand />
			{/if}
			{#if commandCenterState.query.startsWith("?")}
				<FilterGridCommand />
			{/if}
			{#if commandCenterState.query.startsWith("/")}
				<QuickGoToCommandGroup />
			{/if}
			{#if commandCenterState.query.startsWith("@")}
				<SetLocationByGeohashCommand />
			{/if}
		</Command.List>
	</Command.Root>
</Command.Dialog>
