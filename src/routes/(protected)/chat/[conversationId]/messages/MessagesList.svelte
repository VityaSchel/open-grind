<script lang="ts">
	import { promptCopyError } from "$lib/api/error-copy";
	import { showErrorToast } from "$lib/api/error-toast";
	import { tieredFeature } from "$lib/api/error-urn";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "$lib/api/messaging/messages";
	import { offerEntitlementBypass } from "$lib/entitlements/bypass.svelte";
	import {
		type ConversationState,
		getConversationState,
	} from "../conversation-state.svelte";
	import { processMessages } from "../messages";
	import Message from "./message/Message.svelte";

	let { seenMessageIds }: { seenMessageIds: Set<string> } = $props();

	const conversationState = $derived(getConversationState()());

	const messages = $derived(
		processMessages({
			messages: conversationState.messages,
			ourProfileId: conversationState.ourProfileId,
		}),
	);

	async function unsend({
		state,
		messageId,
	}: {
		state: ConversationState;
		messageId: string;
	}) {
		const { revert } = state.markMessageAsUnsent(messageId);
		try {
			await unsendMessage({
				conversationId: state.conversationId,
				messageId,
			});
		} catch (error) {
			revert();
			throw error;
		}
	}

	async function requestUnsend(messageId: string) {
		const state = conversationState;
		try {
			await unsend({ state, messageId });
		} catch (error) {
			console.error(error);
			if (tieredFeature(error) === "UnsentMessage") {
				offerEntitlementBypass({
					reason: "Unsending a message requires a Grindr subscription.",
					retry: () => unsend({ state, messageId }),
				});
				return;
			}
			showErrorToast({ label: "Failed to unsend message", error });
		}
	}
</script>

{#each messages.toReversed() as message (message.messageId)}
	{@const isOut = message.senderId === conversationState.ourProfileId}
	<Message
		{message}
		{isOut}
		indexInStack={message.indexInStack}
		stackLength={message.stackLength}
		dayStart={message.dayStart}
		status={message.status}
		isRead={isOut && message.messageId === messages[0]?.messageId
			? conversationState.lastReadTimestamp === message.timestamp
			: null}
		onVisible={!isOut
			? () => {
					seenMessageIds.add(message.messageId);
					conversationState.reportRead(message);
				}
			: undefined}
		onDelete={async () => {
			let revert: (() => void) | undefined;
			try {
				({ revert } = conversationState.remove(message.messageId));
				await deleteMessageForMe({
					conversationId: conversationState.conversationId,
					messageId: message.messageId,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({ label: "Failed to delete message", error });
				revert?.();
			}
		}}
		onReply={message.status !== "pending" &&
		message.status !== "error" &&
		!message.unsent
			? () => conversationState.setReplyTo(message)
			: undefined}
		onReact={async (reactionType: number) => {
			try {
				await conversationState.reactTo({
					messageId: message.messageId,
					reactionType,
				});
			} catch (error) {
				console.error(error);
				showErrorToast({ label: "Failed to react to message", error });
			}
		}}
		onUnsend={isOut && !message.unsent
			? () => void requestUnsend(message.messageId)
			: undefined}
		onCopyError={message.status === "error"
			? () => void promptCopyError(message.sendError).catch(() => {})
			: undefined}
	/>
{/each}
