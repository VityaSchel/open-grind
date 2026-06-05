<script lang="ts">
	import DistanceFormatted from "$lib/components/DistanceFormatted.svelte";
	import ProfileItem from "$lib/components/ProfileItem.svelte";
	import RelativeTimeDynamic from "$lib/components/RelativeTimeDynamic.svelte";
	import TapIcon from "$lib/components/TapIcon.svelte";
	import * as Item from "$lib/components/ui/item";
	import type { TapProfile } from "$lib/model/interest/tap-profile";

	let {
		tap,
	}: {
		tap: TapProfile;
	} = $props();
</script>

<ProfileItem
	avatarMediaHash={tap.profileImageMediaHash}
	title={tap.displayName}
	onlineUntil={tap.onlineUntil}
	link="/profile/{tap.profileId}"
>
	{#snippet description()}
		{#if tap.distance !== null}
			<Item.Description class="text-muted-foreground">
				<DistanceFormatted distance={tap.distance} />
			</Item.Description>
		{/if}
	{/snippet}
	{#snippet actions()}
		<Item.Actions class="flex flex-col items-end gap-1 min-w-6 @max-[9rem]:hidden">
			<span
				class="text-muted-foreground font-medium text-right truncate max-w-full"
			>
				<RelativeTimeDynamic date={tap.timestamp} />
			</span>
			{#if tap.tapType !== null}
				<TapIcon tapType={tap.tapType} />
			{/if}
		</Item.Actions>
	{/snippet}
</ProfileItem>
