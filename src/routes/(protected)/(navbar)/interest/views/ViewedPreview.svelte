<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";

	import ProfileMiniCard from "$lib/components/profile/ProfileMiniCard.svelte";
	import Frost from "$lib/components/shared/Frost.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import type { ViewPreview } from "$lib/model/interest/views";

	let { preview }: { preview: ViewPreview } = $props();

	const { totalCount, maxDisplayCount } = $derived(preview.viewedCount);
	const viewedCountLabel = $derived(
		totalCount > maxDisplayCount ? `${maxDisplayCount}+` : `${totalCount}`,
	);
</script>

<ProfileMiniCard
	anonymous
	mediaHash={preview.profileImageMediaHash}
	distance={preview.distance}
	isFavorite={preview.isFavorite}
>
	{#snippet overlay(photo: string | null)}
		<div class="absolute inset-0 isolate flex items-center justify-center">
			<div
				class="relative flex size-9 items-center justify-center rounded-full bg-black/35 scrim text-white"
			>
				<Frost
					src={photo}
					blur="veil"
					class="inset-0"
					photoClass="top-1/2 left-1/2 -translate-1/2"
				/>
				{#if preview.isSecretAdmirer}
					<HeartIcon weight="fill" class="size-4.5 text-rose-400" />
					<span class="sr-only">Secret admirer</span>
				{:else}
					<LockSimpleIcon weight="fill" class="size-4.5" />
					<span class="sr-only">Hidden viewer</span>
				{/if}
			</div>
		</div>
		{#if preview.lastViewed !== null || totalCount > 1}
			<div
				class="absolute inset-x-0 bottom-0 z-1 flex items-center justify-between gap-1 bg-linear-to-t from-black/65 to-transparent px-1.5 pt-6 pb-1 text-2xs font-medium text-white/90"
			>
				<span class="truncate">
					{#if preview.lastViewed !== null}
						<RelativeTimeDynamic date={preview.lastViewed} />
					{/if}
				</span>
				{#if totalCount > 1}
					<span
						class="flex shrink-0 items-center gap-0.5"
						title="{totalCount} views"
					>
						<EyeIcon weight="bold" class="size-3" />
						{viewedCountLabel}<span class="sr-only">views</span>
					</span>
				{/if}
			</div>
		{/if}
	{/snippet}
</ProfileMiniCard>
