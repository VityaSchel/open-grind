<script lang="ts">
	import { page } from "$app/state";

	import ProfileItem from "$lib/components/ProfileItem.svelte";
	import RelativeTimeDynamic from "$lib/components/RelativeTimeDynamic.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import { previewLabel } from "$lib/model/message";
	import type { Conversation } from "$lib/model/conversation";

	let {
		conversation,
	}: {
		conversation: Conversation;
	} = $props();

	const preview = $derived(conversation.data.preview);
	const participant = $derived(conversation.data.participants[0]);
	const previewText = $derived(previewLabel(preview));

	const selected = $derived(
		page.params.conversationId === conversation.data.conversationId,
	);
</script>

<ProfileItem
	active={selected}
	avatarMediaHash={participant.primaryMediaHash ?? null}
	title={conversation.data.name}
	onlineUntil={conversation.data.onlineUntil ?? participant.onlineUntil}
	link="/chat/{conversation.data.conversationId}"
	avatarLink="/profile/{participant.profileId}"
>
	{#snippet description()}
		<Item.Description
			class={{
				"font-medium text-white": conversation.data.unreadCount > 0,
			}}
		>
			{#if previewText !== null}
				{previewText}
			{:else}
				<span class="preview-not-available"> Preview not available </span>
			{/if}
		</Item.Description>
	{/snippet}
	{#snippet actions()}
		<Item.Actions class="flex min-w-0 flex-col items-end gap-1">
			<span
				class="max-w-full truncate text-right font-medium text-muted-foreground"
			>
				<RelativeTimeDynamic date={conversation.data.lastActivityTimestamp} />
			</span>
			{#if conversation.data.unreadCount > 0}
				<Badge class="px-[5.5px] @max-row:hidden">
					{conversation.data.unreadCount}
				</Badge>
			{/if}
		</Item.Actions>
	{/snippet}
</ProfileItem>

<style lang="postcss">
	@reference "$layout";
	.preview-not-available {
		@apply font-normal tracking-tight text-muted-foreground italic;
	}
</style>
