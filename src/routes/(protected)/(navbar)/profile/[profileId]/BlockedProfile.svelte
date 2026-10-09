<script lang="ts">
	import { ProhibitIcon } from "phosphor-svelte";

	import { unblockUser } from "$lib/api/browse/blocks";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "./profile-state.svelte";

	let {
		profileId,
		blockedByUs,
		changingViewability,
		markViewable,
	}: {
		profileId: number;
		blockedByUs: boolean;
		changingViewability: boolean;
		markViewable: () => PendingViewabilityChange;
	} = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ProhibitIcon />
		</Empty.Media>
		<Empty.Title>
			{#if blockedByUs}
				{t("profile.blocked.byUs")}
			{:else}
				{t("profile.blocked.byThem")}
			{/if}
		</Empty.Title>
		<Empty.Description>
			{#if blockedByUs}
				<Button
					variant="secondary"
					disabled={changingViewability}
					onclick={() =>
						applyViewabilityChange({
							change: markViewable,
							request: () => unblockUser({ profileId }),
							failureLabel: t(
								"profile.viewability.errors.unblockFailed",
							),
						})}>{t("profile.blocked.unblock")}</Button
				>
			{:else}
				<Rich key="profile.blocked.bugHint">
					{#snippet reportIssueLink(text)}<Link
							href="https://git.opengrind.org/open-grind/open-grind/issues/new?template=.forgejo%2fissue_template%2fbug.yaml"
							target="_blank">{text}</Link
						>{/snippet}
				</Rich>
			{/if}
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
