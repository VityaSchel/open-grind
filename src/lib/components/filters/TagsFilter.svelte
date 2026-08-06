<script lang="ts">
	import { getTags } from "$lib/api/users/tags";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { Tag } from "$lib/model/users/tags";
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

	async function load() {
		const langs = await getTags();
		const flat: (Tag & { textLower: string })[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- function-local dedupe helper, discarded when load() returns
		const seenText = new Set<string>();
		for (const lang of langs) {
			for (const category of lang.categoryCollection) {
				for (const tag of category.tags) {
					const textLower = tag.text.toLowerCase();
					if (!seenText.has(textLower)) {
						seenText.add(textLower);
						flat.push({ ...tag, textLower });
					}
				}
			}
		}
		return {
			categories: langs[0]?.categoryCollection ?? [],
			flat: flat.sort((a, b) => a.text.localeCompare(b.text)),
		};
	}

	const tagsPromise = $derived(load());

	const valueLabel = $derived(value.join(", "));
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
						.filter((t) => t.textLower.includes(query))
						.sort(
							(a, b) =>
								Number(b.textLower.startsWith(query)) -
								Number(a.textLower.startsWith(query)),
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
						{#each shown as tag (tag.tagId)}
							<ToggleGroup.Item value={tag.text}>
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
								<ToggleGroup.Item value={tag.text}>
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
