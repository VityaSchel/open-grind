<script lang="ts">
	import { getTags } from "$lib/api/tags";
	import { Input } from "$lib/components/ui/input";
	import { Spinner } from "$lib/components/ui/spinner";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { Tag } from "$lib/model/tags";

	import FilterDropdown from "./FilterDropdown.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: {
		checked: boolean;
		value: string;
	} = $props();

	let searchQuery = $state("");
	let expanded = $state(false);

	// Load tags catalog
	let tagsPromise = $state(
		getTags().then((langs) => {
			const allTagsList: Tag[] = [];
			const seenText = new Set<string>();
			for (const lang of langs) {
				for (const cat of lang.categoryCollection) {
					for (const tag of cat.tags) {
						if (!seenText.has(tag.text.toLowerCase())) {
							seenText.add(tag.text.toLowerCase());
							allTagsList.push(tag);
						}
					}
				}
			}
			return {
				raw: langs,
				flat: allTagsList.sort((a, b) => a.text.localeCompare(b.text)),
			};
		}),
	);
</script>

<FilterDropdown
	id="tags"
	label="Tags"
	endLabel={value || undefined}
	bind:checked={
		() => checked,
		(v: boolean) => {
			checked = v;
			if (!v) {
				value = "";
			}
		}
	}
>
	<div class="flex flex-col min-w-0">
		<Input
			type="text"
			placeholder="Search tags..."
			bind:value={searchQuery}
			class="h-8 rounded-md text-sm border-muted mb-1"
		/>

		{#await tagsPromise}
			<div class="flex justify-center py-4">
				<Spinner />
			</div>
		{:then { raw, flat }}
			{@const filtered = searchQuery.trim()
				? flat.filter((t) =>
						t.text.toLowerCase().includes(searchQuery.toLowerCase()),
					)
				: []}

			<ToggleGroup.Root
				type="single"
				variant="outline"
				spacing={2}
				class="flex-wrap w-full gap-1"
				bind:value={
					() => value || "",
					(v: string | undefined) => {
						value = v || "";
						checked = !!v;
					}
				}
			>
				{#if searchQuery.trim()}
					{#if filtered.length > 0}
						{#each filtered as tag (tag.tagId)}
							<ToggleGroup.Item value={tag.text}>
								{tag.text}
							</ToggleGroup.Item>
						{/each}
					{:else}
						<div class="text-xs text-muted-foreground py-2 w-full text-center">
							No tags match "{searchQuery}"
						</div>
					{/if}
				{:else}
					<!-- Show categories when no search query -->
					{#each raw[0]?.categoryCollection ?? [] as category, catIndex}
						{#if category.tags.length > 0 && (expanded || catIndex < 2)}
							<div
								class="w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1.5 mb-1 px-1"
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

			{#if !searchQuery.trim()}
				<button
					type="button"
					class="text-xs text-muted-foreground hover:text-foreground font-medium underline mt-1.5 self-start px-1"
					onclick={() => (expanded = !expanded)}
				>
					{#if expanded}
						Less categories
					{:else}
						More categories
					{/if}
				</button>
			{/if}
		{:catch}
			<div class="text-sm text-destructive py-2">Failed to load tags</div>
		{/await}
	</div>
</FilterDropdown>
