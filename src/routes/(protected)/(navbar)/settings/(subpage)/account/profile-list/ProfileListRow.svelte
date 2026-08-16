<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Item from "$lib/components/ui/item";
	import type { ProfileListEntry, ProfileListToggle } from "./profile-list";

	let {
		entry,
		icon,
		label,
		errorLabel,
		setOn,
	}: { entry: ProfileListEntry } & ProfileListToggle = $props();

	const profile = $derived(entry.profile);
	const identifies = $derived(
		profile?.displayName ?? `ID ${entry.profileId}`,
	);

	let on = $state(true);
	let submitting = $state(false);

	async function toggle() {
		if (submitting) return;
		const next = !on;
		submitting = true;
		on = next;
		try {
			await setOn({ profileId: entry.profileId, on: next });
		} catch (error) {
			on = !next;
			console.error(error);
			showErrorToast({
				label: next ? errorLabel.turningOn : errorLabel.turningOff,
				error,
			});
		} finally {
			submitting = false;
		}
	}
</script>

<ProfileItem
	avatar={{ mediaHash: profile?.profileImageMediaHash ?? null }}
	title={{
		value: profile?.displayName ?? null,
		fallback: profile === null ? "Unavailable profile" : undefined,
	}}
	onlineUntil={profile?.onlineUntil ?? null}
	link="/profile/{entry.profileId}"
>
	{#snippet description()}
		{#if profile === null}
			<Item.Description class="text-muted-foreground">
				ID: {entry.profileId}
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
			onclick={toggle}
		>
			{@render icon(on)}
		</Button>
	{/snippet}
</ProfileItem>
