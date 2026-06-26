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
		<Item.Actions class="flex min-w-6 flex-col items-end gap-1 @max-row:hidden">
			<span
				class="max-w-full truncate text-right font-medium text-muted-foreground"
			>
				<RelativeTimeDynamic date={tap.timestamp} />
			</span>
			{#if tap.tapType !== null}
				<TapIcon tapType={tap.tapType} />
			{/if}
		</Item.Actions>
	{/snippet}
</ProfileItem>
