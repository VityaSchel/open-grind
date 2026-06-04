<script lang="ts">
	import { ChatIcon, StarIcon } from "phosphor-svelte";

	import ProfileMiniCard from "$lib/components/ProfileMiniCard.svelte";

	let {
		id,
		displayName = null,
		age = null,
		distance = null,
		medias = null,
		isFavorite = false,
		hadRecentChat = false,
	}: {
		id: number;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		medias?: { mediaHash: string }[] | null;
		isFavorite?: boolean;
		hadRecentChat?: boolean;
	} = $props();
</script>

<ProfileMiniCard
	mediaHash={medias?.[0]?.mediaHash ?? null}
	{displayName}
	{age}
	{distance}
	href="/profile/{id}"
>
	{#snippet overlay()}
		{#if isFavorite || hadRecentChat}
			<div
				class="absolute top-2 inset-s-2 flex w-1/6 flex-col items-center gap-1"
			>
				{#if isFavorite}
					<div class="badge">
						<StarIcon weight="fill" class="m-auto size-4/6 text-yellow-500" />
					</div>
				{/if}
				{#if hadRecentChat}
					<div class="badge">
						<ChatIcon
							weight="fill"
							class="m-auto size-3/5 -translate-y-px text-sky-400"
						/>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</ProfileMiniCard>

<style lang="postcss">
	@reference "$layout";

	.badge {
		@apply flex aspect-square h-auto w-full rounded-full border border-white/10 bg-popover/40 backdrop-blur-2xl;
	}
</style>
