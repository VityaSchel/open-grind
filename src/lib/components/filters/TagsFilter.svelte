<script lang="ts">
	import { getTags } from "$lib/api/users/tags";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { formatList } from "$lib/i18n/format";
	import { tagCatalog } from "$lib/model/browse/grid/filters";
	import { deepEqual } from "$lib/util/deep-equal";
	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: string[] } = $props();

	let searchQuery = $state("");
	let expanded = $state(false);

	const MAX_SEARCH_RESULTS = 50;
	const SEARCH_DEBOUNCE_MS = 50;

	let query = $state("");
	$effect(() => {
		const next = searchQuery.trim().toLowerCase();
		const timeout = setTimeout(() => (query = next), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timeout);
	});

	let catalog: ReturnType<typeof tagCatalog> | null = $state.raw(null);
	const tagsPromise = getTags().then((languages) => {
		const loaded = tagCatalog(languages);
		const keys = loaded.keysOf(value);
		if (!deepEqual(keys, value)) value = keys;
		catalog = loaded;
		return loaded;
	});

	type CatalogTag = ReturnType<typeof tagCatalog>["flat"][number];

	const containsQuery = (tag: CatalogTag) =>
		tag.textsLower.some((text) => text.includes(query));

	const startsWithQuery = (tag: CatalogTag) =>
		tag.textsLower.some((text) => text.startsWith(query));

	const valueLabel = $derived(
		formatList(value.map((key) => catalog?.textOf(key) ?? key)),
	);
</script>

<FilterDropdown
	id="tags"
	label="Tags"
	endLabel={value.length > 5 || valueLabel.length > 20
		? `${value.length} selected`
		: valueLabel}
	bind:checked={
		() => checked,
		(newValue: boolean) => {
			checked = newValue;
			if (!newValue) {
				value = [];
			}
		}
	}
>
	<div class="flex min-w-0 flex-col">
		<div class="w-full pe-1">
			<Input
				id="search-tags"
				type="search"
				placeholder="Search tags..."
				bind:value={searchQuery}
				class="mb-2 text-sm"
			/>
		</div>

		{#await tagsPromise}
			<div class="flex justify-center py-4">
				<Spinner />
			</div>
		{:then { categories, flat }}
			{@const filtered = query
				? flat
						.filter(containsQuery)
						.sort(
							(a, b) =>
								Number(startsWithQuery(b)) -
								Number(startsWithQuery(a)),
						)
				: []}
			{@const shown = filtered.slice(0, MAX_SEARCH_RESULTS)}

			<ToggleGroup.Root
				size="sm"
				type="multiple"
				variant="outline"
				spacing={2}
				class="w-full flex-wrap gap-1"
				bind:value={
					() => value,
					(v: string[]) => {
						value = v;
						checked = !!v.length;
					}
				}
			>
				{#if query}
					{#if shown.length > 0}
						{#each shown as tag (tag.key)}
							<ToggleGroup.Item value={tag.key}>
								{tag.text}
							</ToggleGroup.Item>
						{/each}
						{#if filtered.length > shown.length}
							<div
								class="w-full py-2 text-center text-xs text-muted-foreground"
							>
								Showing first {shown.length} of {filtered.length}
								matches, keep typing to narrow down
							</div>
						{/if}
					{:else}
						<div
							class="w-full py-2 text-center text-xs text-muted-foreground"
						>
							No tags match "{searchQuery}"
						</div>
					{/if}
				{:else}
					{#each categories as category, catIndex (category.text)}
						{#if category.tags.length > 0 && (expanded || catIndex < 2)}
							<div
								class="mt-1.5 mb-1 w-full px-1 text-3xs font-semibold tracking-wider text-muted-foreground uppercase"
							>
								{category.text}
							</div>
							{#each category.tags as tag (tag.tagId)}
								<ToggleGroup.Item value={tag.key}>
									{tag.text}
								</ToggleGroup.Item>
							{/each}
						{/if}
					{/each}
				{/if}
			</ToggleGroup.Root>

			{#if !query}
				<Button
					variant="secondary"
					class="mt-2 w-fit"
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						Less
					{:else}
						More
					{/if}
				</Button>
			{/if}
		{:catch}
			<div class="text-sm text-destructive">Failed to load tags</div>
		{/await}
	</div>
</FilterDropdown>
