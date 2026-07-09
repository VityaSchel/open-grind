<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import { getMyProfile } from "$lib/api/users/profiles";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		id,
	}: {
		id: number;
	} = $props();

	const myProfile = $derived(getMyProfile());
	const myProfilePhotos = $derived(myProfile.then((profile) => profile.medias));
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a
			href="/profile/{id}"
			{...props}
			class={["rounded-full", props.class, "flex-nowrap!"]}
		>
			<Item.Media class="translate-y-none size-14 rounded-full bg-neutral-700">
				{#await myProfilePhotos then photos}
					{@const mainPhoto = photos[0]}
					{#if mainPhoto}
						<UserAvatar
							mediaHash={mainPhoto?.mediaHash ?? null}
							class="size-full *:rounded-full"
							size="lg"
						/>
					{/if}
				{:catch}
					<BrokenUserAvatar />
				{/await}
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title class="inline-block w-full min-w-0 truncate text-left">
					{#await myProfile}
						<Skeleton class="my-0.5 h-3.75 w-32" />
					{:then profile}
						<DisplayName name={profile.displayName} />
					{:catch}
						<span class="load-fail">Failed to load name</span>
					{/await}
				</Item.Title>
				<Item.Description class="inline-block truncate">
					View your profile
				</Item.Description>
			</Item.Content>
			<Item.Actions class="max-cramped:hidden">
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.load-fail {
		@apply text-muted-foreground italic;
	}
</style>
