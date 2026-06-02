<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";

	import { getMyProfile } from "$lib/api/users/profiles";
	import BrokenUserAvatar from "$lib/components/BrokenUserAvatar.svelte";
	import DisplayName from "$lib/components/DisplayName.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import UserAvatar from "$lib/components/UserAvatar.svelte";

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
			<Item.Media class="size-14 bg-neutral-700 rounded-full translate-y-none">
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
				<Item.Title class="truncate min-w-0 w-full inline-block text-left">
					{#await myProfile}
						<Skeleton class="h-3.75 my-0.5 w-32" />
					{:then profile}
						<DisplayName name={profile.displayName} />
					{:catch}
						<span class="load-fail">Failed to load name</span>
					{/await}
				</Item.Title>
				<Item.Description class="truncate inline-block">
					View your profile
				</Item.Description>
			</Item.Content>
			<Item.Actions class="max-xxxxs:hidden">
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.load-fail {
		@apply italic text-muted-foreground;
	}
</style>
