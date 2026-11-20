<script lang="ts">
	import ArrowBendUpLeftIcon from "phosphor-svelte/lib/ArrowBendUpLeftIcon";
	import DotsThreeIcon from "phosphor-svelte/lib/DotsThreeIcon";
	import { flushSync, untrack } from "svelte";
	import { expoOut } from "svelte/easing";
	import type { VirtualElement } from "@floating-ui/dom";
	import type { Attachment } from "svelte/attachments";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { formatClockTime } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { focusIsLost } from "#lib/platform/reveal-keyboard-focus.ts";
	import { menuPressHandlers } from "#lib/util/long-press.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import { scale } from "#lib/util/reduced-motion.ts";
	import {
		MAX_DRAG_PX,
		SwipeToReply,
		wheelInputMode,
	} from "#lib/util/swipe-to-reply.svelte.ts";
	import type { ApiResponseMessage } from "#lib/model/messaging/messages.ts";
	import AlbumContentMessage from "./AlbumContentMessage.svelte";
	import AlbumMessage from "./AlbumMessage.svelte";
	import { type MessageRefs, setMessageContext } from "./context";
	import ExpiringImageMessage from "./ExpiringImageMessage.svelte";
	import GaymojiMessage from "./GaymojiMessage.svelte";
	import GiphyMessage from "./GiphyMessage.svelte";
	import ImageMessage from "./ImageMessage.svelte";
	import LocationMessage from "./LocationMessage.svelte";
	import MessageContextMenu from "./MessageContextMenu.svelte";
	import MessageDateGroup from "./MessageDateGroup.svelte";
	import MessageWrapper from "./MessageWrapper.svelte";
	import ProfilePhotoReplyMessage from "./ProfilePhotoReplyMessage.svelte";
	import Reaction from "./Reaction.svelte";
	import TextMessage from "./TextMessage.svelte";
	import UnsentMessage from "./UnsentMessage.svelte";
	import UnsupportedMessage from "./UnsupportedMessage.svelte";
	import VideoMessage from "./VideoMessage.svelte";

	let {
		message,
		rovingItem,
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
		onReport,
	}: {
		message: ApiResponseMessage;
		rovingItem?: Attachment<HTMLElement>;
		isOut: boolean;
		isRead: boolean | null;
		indexInStack: number;
		stackLength: number;
		dayStart?: number;
		status?: "sent" | "pending" | "error";
		onReact?: (reactionId: number) => void;
		onDelete?: (handoff: { fromKeyboard: boolean }) => void;
		onVisible?: () => void;
		onUnsend?: () => void;
		onCopyError?: () => void;
		onReply?: () => void;
		onReport?: () => void;
	} = $props();

	const swipe = untrack(() =>
		onReply
			? new SwipeToReply({
					direction: isOut ? "left" : "right",
					onReply: () => onReply?.(),
				})
			: null,
	);

	const textContent = $derived.by(() => {
		switch (message.type) {
			case "Text":
				return message.body.text;
			case "AlbumContentReply":
				return message.body.albumContentReply;
			case "ProfilePhotoReply":
				return message.body.photoContentReply;
			default:
				return undefined;
		}
	});
	const hasMenuActions = $derived(
		textContent !== undefined ||
			[onReply, onDelete, onUnsend, onCopyError, onReport].some(
				(action) => action !== undefined,
			),
	);
	const firstInStack = $derived(indexInStack === 0);
	const lastInStack = $derived(indexInStack === stackLength - 1);
	const time = $derived(formatClockTime(message.timestamp));

	setMessageContext(() => ({
		firstInStack,
		lastInStack,
		indexInStack,
		isOut,
	}));

	const ACTIONS_GAP_PX = 4;

	const uid = $props.id();
	const contentId = `${uid}-content`;
	const statusId = `${uid}-status`;

	let contextMenuOpen = $state(false);
	let openedByKeyboard = $state(false);
	let menuOpener: HTMLElement | null = null;
	let rowElement: HTMLElement | null = $state(null);
	let frameElement: HTMLElement | null = $state(null);
	let messageElement: HTMLElement | null = $state(null);
	let actionsButton: HTMLElement | null = $state(null);
	let actionsFocused = $state(false);

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

	$effect(() => {
		if (!hasMenuActions) contextMenuOpen = false;
	});

	function openContextMenu({ byKeyboard }: { byKeyboard: boolean }): boolean {
		if (!messageElement || !frameElement || !hasMenuActions) return false;
		const computed = getComputedStyle(messageElement);
		inheritedStyles = INHERITED_PROPS.map(
			(prop) => `${prop}: ${computed.getPropertyValue(prop)}`,
		).join("; ");
		const focused = document.activeElement;
		menuOpener =
			focused instanceof HTMLElement && rowElement?.contains(focused)
				? focused
				: null;
		openedByKeyboard = byKeyboard;
		contextMenuOpen = true;
		return true;
	}

	function closeContextMenu() {
		const opener = menuOpener;
		menuOpener = null;
		contextMenuOpen = false;
		flushSync();
		if (opener?.isConnected && focusIsLost())
			opener.focus({ preventScroll: true });
	}

	function placeActions() {
		if (!rowElement || !messageElement || !actionsButton) return;
		const row = rowElement.getBoundingClientRect();
		const bubble = messageElement.getBoundingClientRect();
		const rtl = getComputedStyle(rowElement).direction === "rtl";
		const rightOfBubble = isOut === rtl;
		const beside = rightOfBubble
			? bubble.right - row.left
			: row.right - bubble.left;
		const inset = `min(${beside + ACTIONS_GAP_PX}px, 100% - 2rem)`;
		actionsButton.style.top = `${bubble.top - row.top + bubble.height / 2}px`;
		actionsButton.style.left = rightOfBubble ? inset : "";
		actionsButton.style.right = rightOfBubble ? "" : inset;
	}

	$effect(() => {
		if (!actionsFocused || !rowElement || !messageElement) return;
		const observer = new ResizeObserver(placeActions);
		observer.observe(rowElement);
		observer.observe(messageElement);
		return () => observer.disconnect();
	});

	function liftedAnchor({
		frame,
		content,
	}: {
		frame: HTMLElement;
		content: HTMLElement;
	}): VirtualElement {
		return {
			getBoundingClientRect() {
				const contentRect = content.getBoundingClientRect();
				const frameRect = frame.getBoundingClientRect();
				const quoteRect = frame
					.querySelector('[data-slot="message-quote"]')
					?.getBoundingClientRect();
				const width = Math.max(
					contentRect.width,
					quoteRect?.width ?? 0,
				);
				return new DOMRect(
					isOut ? contentRect.right - width : contentRect.x,
					frameRect.y,
					width,
					frameRect.height,
				);
			},
		};
	}

	// A dblclick carries no pointerType of its own, and only the pointer can
	// tell a double tap (react) from a double click (reply).
	let lastPointerType = "";

	const rowPress = menuPressHandlers({
		openMenu: ({ byTouch }) => {
			const opened = openContextMenu({ byKeyboard: false });
			if (opened && byTouch) swipe?.resetTouch();
			return opened;
		},
	});

	function onRowContextMenu(
		event: MouseEvent & { currentTarget: EventTarget & HTMLDivElement },
	) {
		if ((event as Partial<PointerEvent>).pointerType !== "") {
			rowPress.oncontextmenu?.(event);
			return;
		}
		event.preventDefault();
		openContextMenu({ byKeyboard: true });
	}

	const wheelMode = wheelInputMode();
	const railWheel = wheelMode === "rail";
	const touchOnly = wheelMode === "none";
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

{#snippet actions()}
	<Button
		bind:ref={actionsButton}
		data-slot="message-actions"
		variant="secondary"
		size="icon-sm"
		aria-label={t("chat.message.a11y.actions")}
		aria-describedby={lastInStack ? `${contentId} ${statusId}` : contentId}
		aria-haspopup="menu"
		aria-expanded={contextMenuOpen}
		class="absolute size-8 -translate-y-1/2 transition-none not-focus-visible:sr-only"
		onfocus={() => {
			placeActions();
			actionsFocused = true;
		}}
		onblur={() => (actionsFocused = false)}
		onclick={(event) => openContextMenu({ byKeyboard: event.detail === 0 })}
	>
		<DotsThreeIcon weight="bold" />
	</Button>
{/snippet}

{#snippet content(clone?: boolean)}
	<MessageWrapper
		id={clone ? undefined : contentId}
		{clone}
		{setRefs}
		{adornments}
		quoted={message.replyToMessage}
	>
		{#if message.type === "Text"}
			<TextMessage message={message.body} />
		{:else if message.type === "Image"}
			<ImageMessage message={message.body} {isOut} />
		{:else if message.type === "Location"}
			<LocationMessage message={message.body} />
		{:else if message.type === "ExpiringImage"}
			<ExpiringImageMessage
				message={message.body}
				conversationId={message.conversationId}
				messageId={message.messageId}
				{isOut}
			/>
		{:else if message.type === "Album" || message.type === "ExpiringAlbum" || message.type === "ExpiringAlbumV2"}
			<AlbumMessage message={message.body} />
		{:else if message.type === "AlbumContentReply" || message.type === "AlbumContentReaction"}
			<AlbumContentMessage message={message.body} />
		{:else if message.type === "ProfilePhotoReply"}
			<ProfilePhotoReplyMessage message={message.body} {isOut} />
		{:else if message.type === "Video" || message.type === "PrivateVideo"}
			<VideoMessage
				message={message.body}
				conversationId={message.conversationId}
				messageId={message.messageId}
				delivered={status !== "pending" && status !== "error"}
				{isOut}
			/>
		{:else if message.type === "Gaymoji"}
			<GaymojiMessage message={message.body} />
		{:else if message.type === "Giphy"}
			<GiphyMessage message={message.body} />
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
					{ "right-3": isOut, "left-3": !isOut },
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
					"overflow-x-clip": touchOnly,
				},
			]}
		>
			{#if swipe && railWheel && !isOut}
				<div class="shrink-0" style:width="{MAX_DRAG_PX}px"></div>
			{/if}
			<div
				bind:this={rowElement}
				class={[
					"relative w-full shrink-0",
					{
						"pe-3 *:float-start *:me-auto": !isOut,
						"ps-3 *:float-end *:ms-auto": isOut,
					},
				]}
				role="article"
				{@attach rovingItem}
				onpointerdown={(event) => {
					lastPointerType = event.pointerType;
					if (hasMenuActions) rowPress.onpointerdown?.(event);
				}}
				onpointermove={rowPress.onpointermove}
				onpointerup={rowPress.onpointerup}
				onpointercancel={rowPress.onpointercancel}
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
					if (onReply && !event.defaultPrevented) {
						event.preventDefault();
						onReply();
						selection?.removeAllRanges();
					}
				}}
				oncontextmenu={onRowContextMenu}
				style:visibility={contextMenuOpen ? "hidden" : undefined}
				style:transform={swipe?.deltaX
					? `translateX(${swipe.deltaX}px)`
					: undefined}
			>
				{#if hasMenuActions && isOut}
					{@render actions()}
				{/if}
				{@render content()}
				{#if hasMenuActions && !isOut}
					{@render actions()}
				{/if}
			</div>
			{#if swipe && railWheel && isOut}
				<div class="shrink-0" style:width="{MAX_DRAG_PX}px"></div>
			{/if}
		</div>
	</div>
	{#if lastInStack}
		<span
			id={statusId}
			class={[
				"mx-3 mt-0.5 text-xs text-muted-foreground",
				{ "text-right": isOut },
			]}
		>
			{#if status === "pending"}
				{t("chat.message.status.sending")}
			{:else if status === "error"}
				<span class="text-destructive">
					{t("chat.message.status.notSent")}
				</span>
			{:else if isRead === null}
				{time}
			{:else if isRead}
				{t("chat.message.status.readAt", { time })}
			{:else}
				{t("chat.message.status.sentAt", { time })}
			{/if}
		</span>
	{/if}
</div>

{#if contextMenuOpen && frameElement && messageElement}
	<MessageContextMenu
		anchor={liftedAnchor({ frame: frameElement, content: messageElement })}
		{content}
		{isOut}
		selectable={textContent !== undefined}
		onClose={closeContextMenu}
		style={inheritedStyles}
		{textContent}
		reactionAvailable={message.reactions.length === 0 &&
			!isOut &&
			!message.unsent}
		{openedByKeyboard}
		onDelete={onDelete &&
			(() => onDelete({ fromKeyboard: openedByKeyboard }))}
		{onUnsend}
		{onCopyError}
		{onReply}
		{onReport}
		{onReact}
	/>
{/if}
