<script lang="ts">
	import { page } from "$app/state";
	import {
		BellIcon,
		BellSimpleSlashIcon,
		PushPinIcon,
		PushPinSlashIcon,
		TrashIcon,
	} from "phosphor-svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ProfileItem from "$lib/components/profile/ProfileItem.svelte";
	import RelativeTimeDynamic from "$lib/components/shared/RelativeTimeDynamic.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as ContextMenu from "$lib/components/ui/context-menu";
	import * as Item from "$lib/components/ui/item";
	import { previewLabel } from "$lib/model/messaging/messages";
	import type { Conversation } from "$lib/model/messaging/conversations";
	import type { SelectionSet } from "$lib/util/selection.svelte";

	let {
		conversation,
		selection = null,
		onEnterSelection,
		onRequestDelete,
	}: {
		conversation: Conversation;
		selection?: SelectionSet<string> | null;
		onEnterSelection?: () => void;
		onRequestDelete?: () => void;
	} = $props();

	const conversations = getConversations();

	const preview = $derived(conversation.data.preview);
	const participant = $derived(conversation.data.participants[0]);
	const previewText = $derived(previewLabel(preview));
	const conversationId = $derived(conversation.data.conversationId);

	const active = $derived(page.params.conversationId === conversationId);
	const isSelected = $derived(selection?.has(conversationId) ?? false);

	let contextMenuUsed = $state(false);

	function togglePinned() {
		void conversations.setPinned([conversationId], !conversation.data.pinned);
	}

	function toggleMuted() {
		void conversations.setMuted([conversationId], !conversation.data.muted);
	}

	function toggleSelected() {
		selection?.toggle(conversationId);
	}
</script>

{#snippet mutedBadge()}
	<BellSimpleSlashIcon
		weight="fill"
		class="size-4 shrink-0 text-muted-foreground"
	/>
{/snippet}

{#snippet selectedOverlay()}
	<div class="absolute inset-2 flex items-center justify-center">
		<SelectionCheck />
	</div>
{/snippet}

{#snippet row()}
	<ProfileItem
		{active}
		avatar={{
			mediaHash: participant.primaryMediaHash ?? null,
			link: `/profile/${participant.profileId}`,
			overlay: isSelected ? selectedOverlay : undefined
		}}
		title={{
			value: conversation.data.name,
			badge: conversation.data.muted ? mutedBadge : undefined
		}}
		onlineUntil={conversation.data.onlineUntil ?? participant.onlineUntil}
		link="/chat/{conversationId}"
		selected={isSelected}
		onToggleSelected={selection ? toggleSelected : undefined}
		onLongPress={onEnterSelection}
	>
		{#snippet description()}
			<Item.Description
				class={{
					"font-medium text-white":
						conversation.data.unreadCount > 0 && !conversation.data.muted,
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
					class="flex max-w-full items-center gap-1 font-medium text-muted-foreground"
				>
					{#if conversation.data.pinned}
						<PushPinIcon weight="fill" class="size-4 shrink-0" />
					{/if}
					<span class="truncate text-right">
						<RelativeTimeDynamic
							date={conversation.data.lastActivityTimestamp}
						/>
					</span>
				</span>
				{#if conversation.data.unreadCount > 0}
					<Badge
						variant={conversation.data.muted ? "secondary" : "default"}
						class="px-[5.5px] @max-row:hidden"
					>
						{conversation.data.unreadCount}
					</Badge>
				{/if}
			</Item.Actions>
		{/snippet}
	</ProfileItem>
{/snippet}

{#if onEnterSelection}
	{@render row()}
{:else}
	<ContextMenu.Root
		onOpenChange={(open) => {
			if (open) contextMenuUsed = true;
		}}
	>
		<ContextMenu.Trigger>
			{@render row()}
		</ContextMenu.Trigger>
		{#if contextMenuUsed}
			<ContextMenu.Content class="w-48">
				<ContextMenu.Item onSelect={togglePinned}>
					{#if conversation.data.pinned}
						<PushPinSlashIcon weight="fill" class="size-5" />
						Unpin
					{:else}
						<PushPinIcon weight="fill" class="size-5" />
						Pin
					{/if}
				</ContextMenu.Item>
				<ContextMenu.Item onSelect={toggleMuted}>
					{#if conversation.data.muted}
						<BellIcon weight="fill" class="size-5" />
						Unmute
					{:else}
						<BellSimpleSlashIcon weight="fill" class="size-5" />
						Mute
					{/if}
				</ContextMenu.Item>
				<ContextMenu.Separator />
				<ContextMenu.Item variant="destructive" onSelect={onRequestDelete}>
					<TrashIcon class="size-5" />
					Delete
				</ContextMenu.Item>
			</ContextMenu.Content>
		{/if}
	</ContextMenu.Root>
{/if}

<style lang="postcss">
	@reference "$layout";
	.preview-not-available {
		@apply font-normal tracking-tight text-muted-foreground italic;
	}
</style>
