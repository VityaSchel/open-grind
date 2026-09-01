<script lang="ts">
	import { toast } from "svelte-sonner";

	import { promptCopyError } from "$lib/api/error-copy";
	import { showErrorToast } from "$lib/api/error-toast";
	import { tieredFeature } from "$lib/api/error-urn";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "$lib/api/messaging/messages";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { getConversationState } from "../conversation-state.svelte";
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

	function reportUnsendFailure(error: unknown) {
		if (tieredFeature(error) === "UnsentMessage") {
			toast.error("Unsend feature now requires Grindr subscription", {
				id: "unsend-paywall",
				action: {
					label: "Learn more",
					onClick: () =>
						openExternalLink(
							"https://git.opengrind.org/open-grind/open-grind/issues/319#issuecomment-2453",
						),
				},
			});
			return;
		}
		showErrorToast({ label: "Failed to unsend message", error });
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
			? async () => {
					let revert: (() => void) | undefined;
					try {
						({ revert } = conversationState.markMessageAsUnsent(
							message.messageId,
						));
						await unsendMessage({
							conversationId: conversationState.conversationId,
							messageId: message.messageId,
						});
					} catch (error) {
						console.error(error);
						reportUnsendFailure(error);
						revert?.();
					}
				}
			: undefined}
		onCopyError={message.status === "error"
			? () => void promptCopyError(message.sendError).catch(() => {})
			: undefined}
	/>
{/each}
