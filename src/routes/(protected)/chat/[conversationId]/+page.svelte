<script lang="ts">
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import * as Card from "$lib/components/ui/card";
	import type { MessageDraft } from "$lib/model/messaging/messages";
	import ChatNavBar from "./conversation-nav-bar/ConversationNavBar.svelte";
	import {
		ConversationState,
		setConversationState,
	} from "./conversation-state.svelte";
	import MessageComposer from "./message-composer/MessageComposer.svelte";
	import ConversationMessages from "./messages/ConversationMessages.svelte";

	let { data }: import("./$types").PageProps = $props();

	if (page.params.conversationId === undefined)
		throw new Error("conversationId is required");

	const conversations = getConversations();
	const conversationId = $derived(page.params.conversationId as string);
	const ourProfileId = $derived(data.ourProfileId);

	let conversationState = $state(
		untrack(
			() =>
				new ConversationState({
					conversationId,
					ourProfileId: data.ourProfileId,
					conversations,
				}),
		),
	);

	$effect(() => {
		const id = conversationId;
		const profileId = ourProfileId;

		const state = untrack(() => {
			if (
				id !== conversationState.conversationId ||
				profileId !== conversationState.ourProfileId
			) {
				const next = new ConversationState({
					conversationId: id,
					ourProfileId: profileId,
					conversations,
				});
				conversationState = next;
				return next;
			}
			return conversationState;
		});

		return () => state.destroy();
	});

	setConversationState(() => conversationState);

	let composerHeight = $state(0);
</script>

<ChatNavBar />
<Card.Content class="relative flex min-h-0 flex-1 flex-col p-0">
	<ConversationMessages {composerHeight} />
	<MessageComposer
		conversationId={conversationState.conversationId}
		onSend={(drafts: MessageDraft[]) => conversationState.send(drafts)}
		disabled={conversationState.loading || conversationState.error !== null}
		replyTo={conversationState.replyTo}
		onCancelReply={() => conversationState.clearReplyTo()}
		bind:height={composerHeight}
	/>
</Card.Content>
