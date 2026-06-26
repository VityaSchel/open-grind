<script lang="ts">
	import type z from "zod";

	import AcceptNSFWPicsFilter from "$lib/components/filters/AcceptNSFWPicsFilter.svelte";
	import AgeFilter from "$lib/components/filters/age/AgeFilterField.svelte";
	import BodyTypeFilter from "$lib/components/filters/BodyTypeFilter.svelte";
	import FilterBoolean from "$lib/components/filters/FilterBoolean.svelte";
	import {
		defaultFilters,
		gridSearchFiltersSchema,
	} from "$lib/components/filters/filters";
	import GendersFilter from "$lib/components/filters/GendersFilter.svelte";
	import HealthPracticesFilter from "$lib/components/filters/HealthPracticesFilter.svelte";
	import HeightFilter from "$lib/components/filters/HeightFilter.svelte";
	import LookingForFilter from "$lib/components/filters/LookingForFilter.svelte";
	import MeetAtFilter from "$lib/components/filters/MeetAtFilter.svelte";
	import PhotosFilter from "$lib/components/filters/PhotosFilter.svelte";
	import PositionFilter from "$lib/components/filters/position/PositionFilterField.svelte";
	import RelationshipStatusFilter from "$lib/components/filters/RelationshipStatusFilter.svelte";
	import TagsFilter from "$lib/components/filters/TagsFilter.svelte";
	import TribesFilter from "$lib/components/filters/TribesFilter.svelte";
	import WeightFilter from "$lib/components/filters/WeightFilter.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet";

	let {
		open = $bindable(),
		filters = $bindable(),
		onUpdateFilters,
	}: {
		filters: z.infer<typeof gridSearchFiltersSchema>;
		onUpdateFilters: () => void;
		open: boolean;
	} = $props();

	let filtersChanges = $state(defaultFilters);

	$effect(() => {
		if (open) {
			filtersChanges = { ...filters };
		}
	});

	let contentScroll = $state(0);
</script>

{#snippet col1()}
	<FilterBoolean id="favorite" bind:checked={filtersChanges.isFavorite}>
		Favorites
	</FilterBoolean>
	<FilterBoolean id="online" bind:checked={filtersChanges.isOnline}>
		Online
	</FilterBoolean>
	<FilterBoolean id="right-now" bind:checked={filtersChanges.isRightNow}>
		Right now
	</FilterBoolean>
	<AgeFilter
		bind:checked={filtersChanges.ageEnabled}
		bind:value={filtersChanges.age}
	/>
	<GendersFilter
		bind:checked={filtersChanges.genderEnabled}
		bind:value={filtersChanges.genders}
	/>
{/snippet}
{#snippet col2()}
	<PositionFilter
		bind:checked={filtersChanges.positionEnabled}
		bind:value={filtersChanges.positions}
	/>
	<PhotosFilter
		bind:checked={filtersChanges.photosEnabled}
		bind:value={filtersChanges.photos}
	/>
	<TagsFilter
		bind:checked={filtersChanges.tagsEnabled}
		bind:value={filtersChanges.tags}
	/>
{/snippet}
{#snippet col3()}
	<TribesFilter
		bind:checked={filtersChanges.tribesEnabled}
		bind:value={filtersChanges.tribes}
	/>
	<BodyTypeFilter
		bind:checked={filtersChanges.bodyTypesEnabled}
		bind:value={filtersChanges.bodyTypes}
	/>
	<HeightFilter
		bind:checked={filtersChanges.heightEnabled}
		bind:value={filtersChanges.height}
	/>
	<WeightFilter
		bind:checked={filtersChanges.weightEnabled}
		bind:value={filtersChanges.weight}
	/>
	<RelationshipStatusFilter
		bind:checked={filtersChanges.relationshipStatusesEnabled}
		bind:value={filtersChanges.relationshipStatuses}
	/>
	<AcceptNSFWPicsFilter
		bind:checked={filtersChanges.acceptNSFWPicsEnabled}
		bind:value={filtersChanges.acceptNSFWPics}
	/>
	<LookingForFilter
		bind:checked={filtersChanges.lookingForEnabled}
		bind:value={filtersChanges.lookingFor}
	/>
	<MeetAtFilter
		bind:checked={filtersChanges.meetAtEnabled}
		bind:value={filtersChanges.meetAt}
	/>
	<FilterBoolean
		id="havent-chatted-today"
		bind:checked={filtersChanges.haventChattedTodayEnabled}
	>
		Haven't chatted today
	</FilterBoolean>
	<HealthPracticesFilter
		bind:checked={filtersChanges.healthPracticesEnabled}
		bind:value={filtersChanges.healthPractices}
	/>
{/snippet}
<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		preventOverflowTextSelection={false}
		class="mt-(--safe-area-top) mb-(--safe-area-bottom) max-h-screen-safe"
	>
		<Sheet.Header
			class={[
				"border border-x-0 border-t-0 border-transparent p-4 transition-colors",
				{
					"border-muted": contentScroll > 0,
				},
			]}
		>
			<Sheet.Title>Filters</Sheet.Title>
		</Sheet.Header>
		<div
			class="flex max-h-full min-h-0 w-full flex-1 shrink gap-4 overflow-auto px-4 py-1 pb-4 *:flex-1 *:flex-col *:gap-4 **:break-inside-avoid max-lg:flex-col lg:gap-12"
			onscroll={(event) => {
				if (event.target instanceof HTMLDivElement) {
					contentScroll =
						event.target.scrollTop /
						(event.target.scrollHeight - event.target.clientHeight);
				}
			}}
		>
			<div class="flex max-w-full">
				{@render col1()}
			</div>
			<div class="flex max-w-full">
				{@render col2()}
			</div>
			<div class="flex max-w-full">
				{@render col3()}
			</div>
		</div>
		<Sheet.Footer
			class={[
				"border border-x-0 border-b-0 border-transparent p-4 transition-colors sm:items-end",
				{
					"border-muted": contentScroll < 1,
				},
			]}
		>
			<Button
				type="submit"
				onclick={() => {
					filters = filtersChanges;
					onUpdateFilters();
					open = false;
				}}
			>
				Apply
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
