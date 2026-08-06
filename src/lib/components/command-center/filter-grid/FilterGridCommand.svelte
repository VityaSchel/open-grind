<script lang="ts">
	import { goto } from "$app/navigation";
	import { FunnelIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { Badge } from "$lib/components/ui/badge";
	import * as Command from "$lib/components/ui/command";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import {
		commandCenterClose,
		commandCenterState,
	} from "../command-center-state.svelte";
	import { parseFilterGridQuery } from "./filter-grid-query";

	const result = $derived(parseFilterGridQuery(commandCenterState.query));
	const canApply = $derived(
		result.validCount > 0 && result.invalidCount === 0,
	);

	async function apply() {
		if (!canApply) return;
		try {
			void gridState.filters.set({ ...result.filters });
			commandCenterClose();
			await goto("/");
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to apply filters", error });
		}
	}
</script>

<Command.Group heading="Filter grid...">
	<Command.Item
		value={commandCenterState.query || "?"}
		disabled={!canApply}
		class={{ "text-muted-foreground": !canApply }}
		onSelect={apply}
	>
		<FunnelIcon />
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			{#if result.parsed.length === 0}
				<span>
					Type a Grindr grid query, e.g.
					<code
						class="rounded-xs bg-muted px-1 py-px font-mono text-sm"
					>
						online=true&age=18-99&tribes=2,12
					</code>
				</span>
			{:else}
				<div class="flex flex-wrap gap-1">
					{#each result.parsed as filter, index (index)}
						{#if filter.valid}
							<Badge variant="secondary">
								<span class="opacity-60">{filter.key}</span>
								{filter.valueText}
							</Badge>
						{:else}
							<Badge variant="destructive">
								<span class="opacity-80">{filter.key}</span>
								{filter.error}
							</Badge>
						{/if}
					{/each}
				</div>
				{#if canApply}
					<span class="text-xs text-muted-foreground">
						Press Enter to apply {result.validCount}
						{#if result.validCount === 1}
							filter
						{:else}
							filters
						{/if}
					</span>
				{:else}
					<span class="text-xs text-destructive">
						Fix the highlighted filters to apply
					</span>
				{/if}
			{/if}
		</div>
	</Command.Item>
</Command.Group>
