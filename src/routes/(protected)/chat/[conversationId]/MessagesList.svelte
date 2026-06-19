<script lang="ts">
	import { tick, untrack } from "svelte";

	import { ApiError } from "$lib/api";
	import { showErrorToast } from "$lib/api/error";
	import { deleteMessageForMe, unsendMessage } from "$lib/api/messages";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/DataRefreshControl.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Spinner } from "$lib/components/ui/spinner";
	import type { ConversationState } from "./conversation-state.svelte";
	import Message from "./message/Message.svelte";
	import { processMessages } from "./messages";

	let { conversationState }: { conversationState: ConversationState } =
		$props();

	let container: HTMLDivElement | null = $state(null);

	const messages = $derived(
		processMessages({
			messages: conversationState.messages,
			ourProfileId: conversationState.ourProfileId,
		}),
	);

	let refreshControl: DataRefreshControl | undefined = $state();

	async function scrollToRest(behavior: ScrollBehavior) {
		await tick();
		refreshControl?.scrollToRest(behavior);
	}

	let scrollDone = false;
	$effect(() => {
		void conversationState.conversationId;
		untrack(() => {
			scrollDone = false;
		});
	});
	$effect(() => {
		if (!conversationState.loading && !scrollDone && container) {
			scrollDone = true;
			void scrollToRest("instant");
		}
	});

	let lastFirstId = "";
	$effect(() => {
		const firstMessage = conversationState.messages.at(0);
		const firstId = firstMessage?.messageId ?? "";
		if (
			scrollDone &&
			firstMessage &&
			firstId &&
			firstId !== lastFirstId &&
			lastFirstId !== ""
		) {
			if (firstMessage.senderId === conversationState.ourProfileId)
				void scrollToRest("smooth");
		}
		lastFirstId = firstId;
	});

	async function loadMore() {
		if (
			!container ||
			conversationState.loadingMore ||
			conversationState.pageKey === null
		)
			return;
		const prevScrollHeight = container.scrollHeight;
		await conversationState.loadMore();
		await tick();
		container.scrollTop += container.scrollHeight - prevScrollHeight;
	}

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(es) => {
				if (es[0].isIntersecting)
					loadMore().catch((error) => console.error(error));
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

<div
	class="flex-1 flex flex-col min-h-0 overflow-auto gap-1 p-2 max-w-full pt-20 *:first:mt-auto"
	bind:this={container}
	style:overflow-anchor="none"
>
	{#if conversationState.loading}
		{#each Array(10)}
			<Skeleton
				class={[
					"h-9 shrink-0 max-w-full",
					Math.random() < 0.5 ? "self-start" : "self-end",
				]}
				style="width: {Math.floor(Math.random() * 400) + 100}px"
			/>
		{/each}
	{:else if conversationState.error}
		{#if conversationState.error instanceof ApiError && conversationState.error.response?.status === 403}
			<p class="text-muted-foreground text-sm text-center m-auto">
				Conversation is no longer available
			</p>
		{:else}
			<ApiErrorDisplay
				error={conversationState.error}
				onRetry={() => conversationState.retry()}
				class="m-auto"
			/>
		{/if}
	{:else}
		<div
			class="flex flex-col gap-1 min-h-full shrink-0 justify-end overscroll-auto"
		>
			{#if conversationState.loadingMore}
				<Spinner class="mt-25 shrink-0 self-center" />
			{/if}
			{#if conversationState.pageKey !== null}
				<div class="h-0" use:observeSentinel></div>
			{/if}
			{#each messages.toReversed() as message (message.messageId)}
				{@const isOut = message.senderId === conversationState.ourProfileId}
				<Message
					{message}
					{isOut}
					indexInStack={message.indexInStack}
					stackLength={message.stackLength}
					dayStart={message.dayStart}
					status={message.status}
					isRead={isOut && message.messageId === messages[0].messageId
						? conversationState.lastReadTimestamp === message.timestamp
						: null}
					onVisible={!isOut
						? () => conversationState.reportRead(message)
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
							showErrorToast({
								label: "Failed to delete message",
								error,
							});
							revert?.();
						}
					}}
					onReact={async (reactionType: number) => {
						try {
							await conversationState.reactTo(message.messageId, reactionType);
						} catch (error) {
							console.error(error);
							showErrorToast({
								label: "Failed to react to message",
								error,
							});
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
									showErrorToast({
										label: "Failed to unsend message",
										error,
									});
									revert?.();
								}
							}
						: undefined}
				/>
			{/each}
		</div>
		<DataRefreshControl
			bind:this={refreshControl}
			{container}
			updating={conversationState.refreshing}
			class="mt-3 mb-2"
			containerClass="z-10"
			position="bottom"
			onclick={() => void conversationState.refresh()}
		/>
	{/if}
</div>
