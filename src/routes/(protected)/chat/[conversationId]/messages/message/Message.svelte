<script lang="ts">
	import { tick } from "svelte";
	import { expoOut } from "svelte/easing";
	import { scale } from "svelte/transition";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { ApiResponseMessage } from "$lib/model/messaging/messages";
	import AlbumMessage from "./AlbumMessage.svelte";
	import { setMessageContext } from "./context";
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
	} = $props();

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
	let messageElement: HTMLElement | null = $state(null);

	function setRef(el: HTMLElement | null) {
		messageElement = el ?? null;
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
		if (!messageElement) return;
		const rect = messageElement.getBoundingClientRect();
		const computed = getComputedStyle(messageElement);
		inheritedStyles = INHERITED_PROPS.map(
			(prop) => `${prop}: ${computed.getPropertyValue(prop)}`,
		).join("; ");
		contextMenuOpen = {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
		};
		tick()
			.then(() => contextMenu?.showModal())
			.catch((error) => console.error(error));
	}

	let contextMenu: HTMLDialogElement | null = $state(null);
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
	<MessageWrapper {clone} {setRef} {adornments}>
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
	<div
		class={{
			"pe-3 *:float-start *:me-auto": !isOut,
			"ps-3 *:float-end *:ms-auto": isOut,
		}}
		role="button"
		tabindex="0"
		ondblclick={(event) => {
			const selection = window.getSelection();
			if (
				selection &&
				!selection.isCollapsed &&
				messageElement?.contains(selection.anchorNode)
			)
				return;
			if (!isOut && onReact) {
				event.preventDefault();
				onReact(1);
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
		use:observeIntersection={{ handle: onVisible, once: true }}
	>
		{@render content()}
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
		reactionAvailable={message.reactions.length === 0 && !isOut}
		{onDelete}
		{onUnsend}
		{onCopyError}
	/>
{/if}
