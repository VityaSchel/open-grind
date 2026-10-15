<script lang="ts">
	import FunnelIcon from "phosphor-svelte/lib/FunnelIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import UserIcon from "phosphor-svelte/lib/UserIcon";
	import { onMount } from "svelte";
	import { tinykeys } from "tinykeys";

	import OpenProfileByIdCommand from "$lib/components/command-center/open-profile-by-id/OpenProfileByIdCommand.svelte";
	import SetLocationByGeohashCommand from "$lib/components/command-center/set-location-by-geohash/SetLocationByGeohashCommand.svelte";
	import * as Command from "$lib/components/ui/command";
	import { t } from "$lib/i18n";
	import { commandCenterKeybinding } from "$lib/platform/keybindings";
	import {
		commandCenterClose,
		commandCenterState,
	} from "./command-center-state.svelte";
	import CommandSuggestion from "./CommandSuggestion.svelte";
	import FilterGridCommand from "./filter-grid/FilterGridCommand.svelte";
	import QuickGoToCommandGroup from "./quick-go-to/QuickGoToCommandGroup.svelte";

	const suggestionsId = $props.id();

	onMount(() => {
		return tinykeys(window, {
			[commandCenterKeybinding]: (event) => {
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
			placeholder={t("commands.commandCenter.placeholder")}
			aria-controls={suggestionsId}
			bind:value={commandCenterState.query}
		/>
		<Command.List
			id={suggestionsId}
			aria-label={t("commands.commandCenter.a11y.list")}
			class="mt-2"
		>
			<Command.Empty class="text-muted-foreground">
				{t("commands.commandCenter.empty")}
			</Command.Empty>
			{#if commandCenterState.query.length === 0}
				<Command.Group
					heading={t("commands.commandCenter.suggestions.heading")}
					value="suggestions"
				>
					<CommandSuggestion
						prefix="#"
						message="commands.commandCenter.suggestions.openProfileById"
					>
						{#snippet icon()}
							<UserIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion
						prefix="?"
						message="commands.commandCenter.suggestions.filterGrid"
					>
						{#snippet icon()}
							<FunnelIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion
						prefix="/"
						message="commands.commandCenter.suggestions.quickGoTo"
					>
						{#snippet icon()}
							<MagnifyingGlassIcon />
						{/snippet}
					</CommandSuggestion>
					<CommandSuggestion
						prefix="@"
						message="commands.commandCenter.suggestions.setLocationByGeohash"
					>
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
