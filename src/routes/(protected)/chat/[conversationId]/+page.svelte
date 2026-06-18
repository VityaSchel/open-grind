<script lang="ts">
	import { page } from "$app/state";
	import { untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import * as Card from "$lib/components/ui/card";
	import type { Message } from "$lib/model/message";
	import ChatNavBar from "./ChatNavBar.svelte";
	import { ConversationState } from "./conversation-state.svelte";
	import MessageComposer from "./MessageComposer.svelte";
	import MessagesList from "./MessagesList.svelte";

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
</script>

<ChatNavBar {conversationState} />
<Card.Content class="flex flex-col flex-1 pb-2 px-0 min-h-0">
	<MessagesList {conversationState} />
	<MessageComposer
		onSend={(message: Message) => conversationState.send(message)}
		disabled={conversationState.loading || conversationState.error !== null}
	/>
</Card.Content>
