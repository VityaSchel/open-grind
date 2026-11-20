<script lang="ts">
	import { tick } from "svelte";

	import { promptCopyError } from "#lib/api/error-copy.ts";
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { tieredFeature } from "#lib/api/error-urn.ts";
	import {
		deleteMessageForMe,
		unsendMessage,
	} from "#lib/api/messaging/messages.ts";
	import ReportSheet from "#lib/components/report/ReportSheet.svelte";
	import {
		offerEntitlementBypass,
		reportRefusedDespiteBypass,
	} from "#lib/entitlements/bypass.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import { focusIsLost } from "#lib/platform/reveal-keyboard-focus.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import {
		type ConversationState,
		getConversationState,
		type OptimisticMessage,
	} from "../conversation-state.svelte";
	import { processMessages } from "../messages";
	import { setMediaRenewal } from "./message/media-renewal";
	import Message from "./message/Message.svelte";

	let { seenMessageIds }: { seenMessageIds: Set<string> } = $props();

	const MESSAGE_CELL = "a[href], button";

	let reportOpen = $state(false);
	let reportProfileId = $state<number | null>(null);

	const conversationState = $derived(getConversationState()());
	setMediaRenewal(() => conversationState.dynamicRefresh.renewMedia());

	const chronological = $derived(conversationState.messages.toReversed());
	const messageIds = $derived(
		chronological.map((message) => message.messageId),
	);

	function messageCells(article: HTMLElement): HTMLElement[] {
		return [...article.querySelectorAll<HTMLElement>(MESSAGE_CELL)].filter(
			(cell) => cell.getClientRects().length > 0,
		);
	}

	const roving = new RovingFocusState({
		keys: () => messageIds,
		orientation: "vertical",
		cells: messageCells,
		primaryCell: (cells) =>
			cells.find((cell) => cell.dataset.slot === "message-actions") ??
			cells[0]!,
		cellOnRowChange: "primary",
		followScroll: "last-visible",
		consumeAtEdge: ["left", "right"],
	});

	$effect(() => {
		roving.activeKey ??= messageIds.at(-1) ?? null;
	});

	async function focusMessageAt(index: number) {
		await tick();
		if (!focusIsLost() || messageIds.length === 0) return;
		void roving.focus({
			key: messageIds[Math.min(index, messageIds.length - 1)],
		});
	}

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
				const lease = await offerEntitlementBypass({
					reason: "chat.conversation.bypassReason.unsend",
				});
				if (lease === null) return;
				await unsend({ state, messageId })
					.catch(reportRefusedDespiteBypass)
					.finally(lease.release);
				return;
			}
			showErrorToast({
				label: t("chat.messages.errors.unsendFailed"),
				error,
			});
		}
	}

	async function deleteForMe({
		message,
		fromKeyboard,
	}: {
		message: OptimisticMessage;
		fromKeyboard: boolean;
	}) {
		const state = conversationState;
		const index = messageIds.indexOf(message.messageId);
		const { revert } = state.remove(message.messageId);
		if (fromKeyboard) void focusMessageAt(index);
		if (message.status === "error") return;
		try {
			await deleteMessageForMe({
				conversationId: state.conversationId,
				messageId: message.messageId,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("chat.messages.errors.deleteFailed"),
				error,
			});
			revert();
		}
	}
</script>

<div class="flex flex-col gap-1 empty:hidden" {@attach roving.container}>
	{#each chronological as message (message.messageId)}
		{@const isOut = message.senderId === conversationState.ourProfileId}
		{@const delivered = message.status === "sent"}
		{@const layout = layoutByMessageId.get(message.messageId)}
		{@const indexInStack = layout?.indexInStack ?? 0}
		{@const stackLength = layout?.stackLength ?? 1}
		{@const dayStart = layout?.dayStart}
		{@const isRead =
			isOut &&
			message.messageId === conversationState.messages[0]?.messageId
				? conversationState.lastReadTimestamp === message.timestamp
				: null}
		<Message
			{message}
			rovingItem={roving.item(message.messageId)}
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
				: ({ fromKeyboard }) => deleteForMe({ message, fromKeyboard })}
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
					showErrorToast({
						label: t("chat.messages.errors.reactFailed"),
						error,
					});
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
</div>

{#if reportProfileId !== null}
	<ReportSheet
		bind:open={reportOpen}
		target={{ kind: "message", profileId: reportProfileId }}
	/>
{/if}
