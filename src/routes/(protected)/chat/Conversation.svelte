<script lang="ts">
	import { page } from "$app/state";

	import ProfileItem from "$lib/components/ProfileItem.svelte";
	import RelativeTimeDynamic from "$lib/components/RelativeTimeDynamic.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import type { Conversation } from "$lib/model/conversation";

	let {
		conversation,
	}: {
		conversation: Conversation;
	} = $props();

	const preview = $derived(conversation.data.preview);
	const participant = $derived(conversation.data.participants[0]);

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
			{#if preview !== null}
				{#if preview.text !== null}
					{preview.text}
				{:else if preview.albumId !== null}
					Album
				{:else if preview.imageHash !== null || preview.type === "Image"}
					Photo
				{:else}
					<span class="preview-not-available"> Preview not available </span>
				{/if}
			{:else}
				<span class="preview-not-available"> Preview not available </span>
			{/if}
		</Item.Description>
	{/snippet}
	{#snippet actions()}
		<Item.Actions class="flex flex-col items-end gap-1 min-w-0">
			<span
				class="text-muted-foreground font-medium text-right truncate max-w-full"
			>
				<RelativeTimeDynamic date={conversation.data.lastActivityTimestamp} />
			</span>
			{#if conversation.data.unreadCount > 0}
				<Badge class="px-[5.5px] @max-[9rem]:hidden">
					{conversation.data.unreadCount}
				</Badge>
			{/if}
		</Item.Actions>
	{/snippet}
</ProfileItem>

<style lang="postcss">
	@reference "$layout";
	.preview-not-available {
		@apply font-normal tracking-tight italic text-muted-foreground;
	}
</style>
