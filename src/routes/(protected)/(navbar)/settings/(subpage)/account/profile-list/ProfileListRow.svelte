<script lang="ts">
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Item from "$lib/components/ui/item";
	import type { ProfileListProfile, ProfileListToggle } from "./profile-list";

	let {
		profileId,
		profile,
		on,
		submitting,
		icon,
		label,
		onToggle,
	}: {
		profileId: number;
		profile: ProfileListProfile | null;
		on: boolean;
		submitting: boolean;
		onToggle: () => void;
	} & Pick<ProfileListToggle, "icon" | "label"> = $props();

	const identifies = $derived(profile?.displayName ?? `ID ${profileId}`);
</script>

<ProfileItem
	avatar={{ mediaHash: profile?.profileImageMediaHash ?? null }}
	title={{
		value: profile?.displayName ?? null,
		fallback: profile === null ? "Unavailable profile" : undefined,
	}}
	onlineUntil={profile?.onlineUntil ?? null}
	link="/profile/{profileId}"
>
	{#snippet description()}
		{#if profile === null}
			<Item.Description class="text-muted-foreground">
				ID: {profileId}
			</Item.Description>
		{:else if profile.distance !== null}
			<Item.Description class="text-muted-foreground">
				<DistanceFormatted distance={profile.distance} />
			</Item.Description>
		{/if}
	{/snippet}
	{#snippet control()}
		<Button
			size="icon-lg"
			variant="ghost"
			role="switch"
			aria-checked={on}
			aria-label="{label}: {identifies}"
			disabled={submitting}
			onclick={onToggle}
		>
			{@render icon(on)}
		</Button>
	{/snippet}
</ProfileItem>
