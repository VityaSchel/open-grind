<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import FieldPair from "./fields/FieldPair.svelte";
	import { maxProfilePhotos } from "./options";
	import ProfileFormSection from "./ProfileFormSection.svelte";
</script>

{#snippet heading()}
	<Skeleton class="ms-1 h-7 w-28" />
{/snippet}

{#snippet label()}
	<Skeleton class="mx-1 h-3.5 w-24" />
{/snippet}

{#snippet field()}
	<div class="flex flex-col gap-1.5">
		{@render label()}
		<Skeleton class="h-9 w-full rounded-full" />
	</div>
{/snippet}

{#snippet fieldWithHint()}
	<div class="flex flex-col gap-1.5">
		{@render label()}
		<Skeleton class="h-9 w-full rounded-full" />
		<Skeleton class="mx-1 h-4 w-14" />
	</div>
{/snippet}

{#snippet wheelField()}
	<div class="flex flex-col gap-1.5">
		{@render label()}
		<Skeleton class="h-44 w-full" />
	</div>
{/snippet}

{#snippet multilineField()}
	<div class="flex flex-col gap-1.5">
		{@render label()}
		<Skeleton class="h-24 w-full" />
		<Skeleton class="mx-1 h-4 w-8 self-end" />
	</div>
{/snippet}

{#snippet switchRow()}
	<div class="flex items-center justify-between gap-3 px-1 py-2.5">
		<Skeleton class="h-3.5 w-28" />
		<Skeleton class="h-5 w-11 rounded-full" />
	</div>
{/snippet}

<div data-slot="profile-form-skeleton" class="flex grow flex-col gap-6">
	<ProfileFormSection>
		{@render heading()}
		<div
			data-slot="profile-form-skeleton-photos"
			class="grid grid-cols-3 gap-2"
		>
			{#each Array.from({ length: maxProfilePhotos })}
				<Skeleton class="aspect-square rounded-xl" />
			{/each}
		</div>
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render fieldWithHint()}
		<FieldPair>
			{@render wheelField()}
			{@render switchRow()}
		</FieldPair>
		<FieldPair>
			{@render field()}
			{@render switchRow()}
		</FieldPair>
		{@render field()}
		{@render field()}
		{@render field()}
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render fieldWithHint()}
		{@render multilineField()}
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render fieldWithHint()}
		{@render fieldWithHint()}
		<FieldPair>
			{@render field()}
			{@render switchRow()}
		</FieldPair>
		{@render field()}
		{@render field()}
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render field()}
		{@render field()}
		{@render field()}
		{@render field()}
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render field()}
		{@render field()}
		{@render field()}
		{@render field()}
	</ProfileFormSection>

	<ProfileFormSection>
		{@render heading()}
		{@render field()}
		{@render field()}
		{@render field()}
	</ProfileFormSection>
</div>
