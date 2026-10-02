<script lang="ts">
	import { promptCopyError } from "$lib/api/error-copy";
	import { showErrorToast } from "$lib/api/error-toast";
	import { tieredFeature } from "$lib/api/error-urn";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "$lib/api/messaging/messages";
	import ReportSheet from "$lib/components/report/ReportSheet.svelte";
	import { offerEntitlementBypass } from "$lib/entitlements/bypass.svelte";
	import {
		type ConversationState,
		getConversationState,
		type OptimisticMessage,
	} from "../conversation-state.svelte";
	import { processMessages } from "../messages";
	import { setMediaRenewal } from "./message/media-renewal";
	import Message from "./message/Message.svelte";

	let { seenMessageIds }: { seenMessageIds: Set<string> } = $props();

	let reportOpen = $state(false);
	let reportProfileId = $state<number | null>(null);

	const conversationState = $derived(getConversationState()());
	setMediaRenewal(() => conversationState.dynamicRefresh.renewMedia());

	const layoutByMessageId = $derived(
		new Map(
			processMessages({
				messages: conversationState.messages,
				ourProfileId: conversationState.ourProfileId,
			}).map((layout) => [layout.messageId, layout] as const),
		),
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

	async function deleteForMe(message: OptimisticMessage) {
		const state = conversationState;
		const { revert } = state.remove(message.messageId);
		if (message.status === "error") return;
		try {
			await deleteMessageForMe({
				conversationId: state.conversationId,
				messageId: message.messageId,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to delete message", error });
			revert();
		}
	}
</script>

{#each conversationState.messages.toReversed() as message (message.messageId)}
	{@const isOut = message.senderId === conversationState.ourProfileId}
	{@const delivered = message.status === "sent"}
	{@const layout = layoutByMessageId.get(message.messageId)}
	{@const indexInStack = layout?.indexInStack ?? 0}
	{@const stackLength = layout?.stackLength ?? 1}
	{@const dayStart = layout?.dayStart}
	{@const isRead =
		isOut && message.messageId === conversationState.messages[0]?.messageId
			? conversationState.lastReadTimestamp === message.timestamp
			: null}
	<Message
		{message}
		{isOut}
		{indexInStack}
		{stackLength}
		{dayStart}
		status={message.status}
		{isRead}
		onVisible={!isOut
			? () => {
					seenMessageIds.add(message.messageId);
					conversationState.reportRead(message);
				}
			: undefined}
		onDelete={message.status === "pending"
			? undefined
			: () => deleteForMe(message)}
		onReply={delivered && !message.unsent
			? () => conversationState.setReplyTo(message)
			: undefined}
		onReport={!isOut && conversationState.profile
			? () => {
					reportProfileId =
						conversationState.profile?.profileId ?? null;
					reportOpen = reportProfileId !== null;
				}
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
		onUnsend={isOut && delivered && !message.unsent
			? () => void requestUnsend(message.messageId)
			: undefined}
		onCopyError={message.status === "error"
			? () => void promptCopyError(message.sendError).catch(() => {})
			: undefined}
	/>
{/each}

{#if reportProfileId !== null}
	<ReportSheet
		bind:open={reportOpen}
		profileId={reportProfileId}
		subject="message"
		locations={["CHAT_MESSAGE"]}
	/>
{/if}
