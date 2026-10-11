<script lang="ts">
	import { goto } from "$app/navigation";
	import { FunnelIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { Badge } from "$lib/components/ui/badge";
	import * as Command from "$lib/components/ui/command";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
	import {
		commandCenterClose,
		commandCenterState,
	} from "../command-center-state.svelte";
	import { filterErrorText } from "./filter-error-text";
	import {
		type ParsedFilter,
		parseFilterGridQuery,
	} from "./filter-grid-query";

	const QUERY_EXAMPLE = "online=true&age=18-99&tribes=2,12";

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
			showErrorToast({
				label: t("commands.filterGrid.errors.applyFailed"),
				error,
			});
		}
	}
</script>

{#snippet filterName({ key, label }: ParsedFilter)}
	{#if label}{t(label)}{:else}<span translate="no">{key}</span>{/if}
{/snippet}

{#snippet filterValue({ valueParts }: ParsedFilter)}
	<span>
		{#each valueParts as part, index (index)}
			{#if part.verbatim}<span translate="no">{part.text}</span
				>{:else}{part.text}{/if}
		{/each}
	</span>
{/snippet}

{#snippet example()}
	<code
		class="rounded-xs bg-muted px-1 py-px font-mono text-sm"
		translate="no"
	>
		{QUERY_EXAMPLE}
	</code>
{/snippet}

<Command.Group heading={t("commands.filterGrid.heading")} value="filter-grid">
	<Command.Item
		value={commandCenterState.query || "?"}
		disabled={!canApply}
		class={{ "text-muted-foreground": !canApply }}
		onSelect={apply}
	>
		<FunnelIcon />
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			{#if result.parsed.length === 0}
				<span><Rich key="commands.filterGrid.hint" {example} /></span>
			{:else}
				<div class="flex flex-wrap gap-1">
					{#each result.parsed as filter, index (index)}
						{#if filter.error === undefined}
							<Badge variant="secondary">
								<span class="opacity-60">
									{@render filterName(filter)}
								</span>
								{@render filterValue(filter)}
							</Badge>
						{:else}
							<Badge variant="destructive">
								<span class="opacity-80">
									{@render filterName(filter)}
								</span>
								{filterErrorText(filter.error)}
							</Badge>
						{/if}
					{/each}
				</div>
				{#if canApply}
					<span class="text-xs text-muted-foreground">
						{t("commands.filterGrid.applyHint", {
							count: result.validCount,
						})}
					</span>
				{:else}
					<span class="text-xs text-destructive">
						{t("commands.filterGrid.fixHint")}
					</span>
				{/if}
			{/if}
		</div>
	</Command.Item>
</Command.Group>
