<script lang="ts">
	import { ArrowBendUpLeftIcon } from "phosphor-svelte";
	import { tick, untrack } from "svelte";
	import { expoOut } from "svelte/easing";
	import { scale } from "svelte/transition";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import {
		MAX_DRAG_PX,
		SwipeToReply,
		wheelInputMode,
	} from "$lib/util/swipe-to-reply.svelte";
	import type { ApiResponseMessage } from "$lib/model/messaging/messages";
	import AlbumMessage from "./AlbumMessage.svelte";
	import { type MessageRefs, setMessageContext } from "./context";
	import ExpiringImageMessage from "./ExpiringImageMessage.svelte";
	import ImageMessage from "./ImageMessage.svelte";
	import MessageContextMenu from "./MessageContextMenu.svelte";
	import MessageDateGroup from "./MessageDateGroup.svelte";
	import MessageTime from "./MessageTime.svelte";
	import MessageWrapper from "./MessageWrapper.svelte";
	import Reaction from "./Reaction.svelte";
	import TextMessage from "./TextMessage.svelte";
	import UnsentMessage from "./UnsentMessage.svelte";
	import UnsupportedMessage from "./UnsupportedMessage.svelte";

	let {
		message,
		isOut,
		isRead,
		indexInStack,
		stackLength,
		dayStart,
		status,
		onReact,
		onDelete,
		onVisible,
		onUnsend,
		onCopyError,
		onReply,
	}: {
		message: ApiResponseMessage;
		isOut: boolean;
		isRead: boolean | null;
		indexInStack: number;
		stackLength: number;
		dayStart?: number;
		status?: "sent" | "pending" | "error";
		onReact?: (reactionId: number) => void;
		onDelete?: () => void;
		onVisible?: () => void;
		onUnsend?: () => void;
		onCopyError?: () => void;
		onReply?: () => void;
	} = $props();

	const swipe = untrack(() =>
		onReply
			? new SwipeToReply({
					direction: isOut ? "left" : "right",
					onReply: () => onReply?.(),
				})
			: null,
	);

	const firstInStack = $derived(indexInStack === 0);
	const lastInStack = $derived(indexInStack === stackLength - 1);

	setMessageContext(() => ({
		firstInStack,
		lastInStack,
		indexInStack,
		isOut,
		timestamp: message.timestamp,
	}));

	let contextMenuOpen:
		| false
		| { x: number; y: number; width: number; height: number } =
		$state(false);
	let frameElement: HTMLElement | null = $state(null);
	let messageElement: HTMLElement | null = $state(null);

	function setRefs({ frame, content }: MessageRefs) {
		frameElement = frame;
		messageElement = content;
	}
	let inheritedStyles = $state("");

	const INHERITED_PROPS = [
		"font-size",
		"font-family",
		"font-weight",
		"font-style",
		"font-variant",
		"font-stretch",
		"line-height",
		"letter-spacing",
		"word-spacing",
		"text-transform",
		"text-indent",
		"text-align",
		"text-decoration",
		"color",
		"direction",
		"white-space",
		"word-break",
		"overflow-wrap",
		"tab-size",
		"hyphens",
		"cursor",
		"border-collapse",
		"border-spacing",
		"list-style",
		"list-style-type",
		"quotes",
	];

	function onContextMenu() {
		if (!messageElement || !frameElement) return;
		// The clone renders the quote too, so it is the frame that decides how
		// tall the lifted box is, while the bubble still decides where it sits.
		const contentRect = messageElement.getBoundingClientRect();
		const frameRect = frameElement.getBoundingClientRect();
		const quoteRect = frameElement
			.querySelector('[data-slot="message-quote"]')
			?.getBoundingClientRect();
		const liftedWidth = Math.max(contentRect.width, quoteRect?.width ?? 0);
		const computed = getComputedStyle(messageElement);
		inheritedStyles = INHERITED_PROPS.map(
			(prop) => `${prop}: ${computed.getPropertyValue(prop)}`,
		).join("; ");
		contextMenuOpen = {
			x: isOut ? contentRect.right - liftedWidth : contentRect.x,
			y: frameRect.y,
			width: liftedWidth,
			height: frameRect.height,
		};
		tick()
			.then(() => contextMenu?.showModal())
			.catch((error) => console.error(error));
	}

	let contextMenu: HTMLDialogElement | null = $state(null);

	// A dblclick carries no pointerType of its own, and only the pointer can
	// tell a double tap (react) from a double click (reply).
	let lastPointerType = "";

	const railWheel = wheelInputMode() === "rail";
</script>

{#snippet adornments()}
	<div
		class={[
			"absolute top-0 z-5 -translate-y-1/2",
			{
				"right-0 translate-x-1/2": !isOut,
				"left-0 -translate-x-1/2": isOut,
			},
		]}
	>
		{#if message.reactions.length > 0}
			{@const reactionMap = message.reactions.reduce(
				(m, r) =>
					m.set(r.reactionType, (m.get(r.reactionType) ?? 0) + 1),
				new Map<number, number>(),
			)}
			<div
				class="mt-1 mr-1 flex items-center gap-0.5"
				transition:scale={{ duration: 150, easing: expoOut }}
			>
				{#each reactionMap.entries() as [type] (type)}
					<Reaction type={Number(type)} />
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet content(clone?: boolean)}
	<MessageWrapper
		{clone}
		{setRefs}
		{adornments}
		quoted={message.replyToMessage}
	>
		{#if message.type === "Text"}
			<TextMessage message={message.body} />
		{:else if message.type === "Image"}
			<ImageMessage message={message.body} />
		{:else if message.type === "ExpiringImage"}
			<ExpiringImageMessage
				message={message.body}
				conversationId={message.conversationId}
				messageId={message.messageId}
				{isOut}
			/>
		{:else if message.type === "Album" || message.type === "ExpiringAlbum" || message.type === "ExpiringAlbumV2"}
			<AlbumMessage message={message.body} />
		{:else if message.type === "Unsent"}
			<UnsentMessage />
		{:else}
			<UnsupportedMessage
				type={"unrecognizedType" in message
					? message.unrecognizedType
					: message.type}
			/>
		{/if}
	</MessageWrapper>
{/snippet}

<div class={["relative z-1 flex flex-col gap-0.5", { "mt-3": firstInStack }]}>
	{#if firstInStack && dayStart !== undefined}
		<MessageDateGroup {dayStart} />
	{/if}
	<!-- The visibility observer roots itself at the nearest scrolling
	     ancestor, so it has to sit outside the rail: inside, the row fills
	     that box and would report itself seen without ever being scrolled to. -->
	<div
		data-slot="message"
		class={["relative flex flex-col", { "touch-pan-y": swipe !== null }]}
		use:observeIntersection={{ handle: onVisible, once: true }}
		{...swipe?.handlers}
	>
		{#if swipe}
			<div
				class={[
					"pointer-events-none absolute top-1/2 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground",
					{ "right-0": isOut, "left-0": !isOut },
				]}
				style:opacity={swipe.progress}
				style:transform={`translateY(-50%) scale(${swipe.armed ? 1 : 0.6 + swipe.progress * 0.4})`}
			>
				<ArrowBendUpLeftIcon size={16} />
			</div>
		{/if}
		<div
			{@attach swipe ? swipe.attachRail : undefined}
			class={[
				"-my-3 flex touch-pan-y py-3",
				{
					"overflow-x-auto overscroll-x-none [scrollbar-width:none]":
						railWheel,
				},
			]}
		>
			{#if swipe && railWheel && !isOut}
				<div class="shrink-0" style:width="{MAX_DRAG_PX}px"></div>
			{/if}
			<div
				class={[
					"w-full shrink-0",
					{
						"pe-3 *:float-start *:me-auto": !isOut,
						"ps-3 *:float-end *:ms-auto": isOut,
					},
				]}
				role="button"
				tabindex="0"
				onpointerdown={(event) => (lastPointerType = event.pointerType)}
				ondblclick={(event) => {
					const selection = window.getSelection();
					if (
						selection &&
						!selection.isCollapsed &&
						messageElement?.contains(selection.anchorNode)
					)
						return;
					if (lastPointerType === "touch") {
						if (!isOut && onReact) {
							event.preventDefault();
							onReact(1);
							selection?.removeAllRanges();
						}
						return;
					}
					if (onReply) {
						event.preventDefault();
						onReply();
						selection?.removeAllRanges();
					}
				}}
				onkeydown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						if (event.key === " ") event.preventDefault();
						onContextMenu();
					}
				}}
				oncontextmenu={(event) => {
					event.preventDefault();
					onContextMenu();
				}}
				style:visibility={contextMenuOpen ? "hidden" : undefined}
				style:transform={swipe?.deltaX
					? `translateX(${swipe.deltaX}px)`
					: undefined}
			>
				{@render content()}
			</div>
			{#if swipe && railWheel && isOut}
				<div class="shrink-0" style:width="{MAX_DRAG_PX}px"></div>
			{/if}
		</div>
	</div>
	{#if lastInStack}
		<span
			class={[
				"mx-3 mt-0.5 text-xs text-muted-foreground",
				{ "text-right": isOut },
			]}
		>
			{#if status === "pending"}
				Sending...
			{:else if status === "error"}
				<span class="text-destructive"> Failed to send </span>
			{:else}
				{#if isRead !== null}
					{#if isRead}
						Read
					{:else}
						Sent
					{/if}
				{/if}
				<MessageTime />
			{/if}
		</span>
	{/if}
</div>

{#if contextMenuOpen}
	<MessageContextMenu
		{contextMenuOpen}
		{content}
		{isOut}
		selectable={message.type === "Text"}
		onClose={() => (contextMenuOpen = false)}
		style={inheritedStyles}
		textContent={message.type === "Text" ? message.body.text : undefined}
		reactionAvailable={message.reactions.length === 0 &&
			!isOut &&
			!message.unsent}
		{onDelete}
		{onUnsend}
		{onCopyError}
		{onReply}
		{onReact}
	/>
{/if}
