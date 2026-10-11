<script lang="ts">
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import * as Item from "$lib/components/ui/item";
	import { t } from "$lib/i18n";
	import type { ProfileListProfile, ProfileListToggle } from "./profile-list";

	let {
		profileId,
		profile,
		on,
		submitting,
		icon,
		control: controlKind = "button",
		label,
		onToggle,
	}: {
		profileId: number;
		profile: ProfileListProfile | null;
		on: boolean;
		submitting: boolean;
		onToggle: () => void;
	} & Pick<ProfileListToggle, "icon" | "control" | "label"> = $props();

	const id = $derived(String(profileId));
	const identifies = $derived(
		profile?.displayName ?? t("common.profileList.a11y.profileId", { id }),
	);
	const toggleLabel = $derived(
		t("common.profileList.a11y.toggle", { label, name: identifies }),
	);
</script>

<ProfileItem
	avatar={{ mediaHash: profile?.profileImageMediaHash ?? null }}
	title={{
		value: profile?.displayName ?? null,
		fallback:
			profile === null ? t("common.profileList.unavailable") : undefined,
	}}
	onlineUntil={profile?.onlineUntil ?? null}
	link="/profile/{profileId}"
>
	{#snippet description()}
		{#if profile === null}
			<Item.Description class="text-muted-foreground">
				{t("common.profileList.profileId", { id })}
			</Item.Description>
		{:else if profile.distance !== null}
			<Item.Description class="text-muted-foreground">
				<DistanceFormatted distance={profile.distance} />
			</Item.Description>
		{/if}
	{/snippet}
	{#snippet control()}
		{#if controlKind === "checkbox"}
			<Checkbox
				class="size-5 border-muted-foreground/50 after:-inset-y-3 data-checked:border-primary"
				checked={on}
				aria-label={toggleLabel}
				disabled={submitting}
				onCheckedChange={onToggle}
			/>
		{:else}
			<Button
				size="icon-lg"
				variant="ghost"
				role="switch"
				aria-checked={on}
				aria-label={toggleLabel}
				disabled={submitting}
				onclick={onToggle}
			>
				{@render icon(on)}
			</Button>
		{/if}
	{/snippet}
</ProfileItem>
