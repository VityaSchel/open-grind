<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import * as InputGroup from "#lib/components/ui/input-group/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { GIF_INPUT_MAX_LENGTH } from "./gif-feed.svelte";

	let {
		input = $bindable(null),
		value,
		onInput,
		onSubmit,
		onEnterFromKeyboard,
		onArrowDown,
		onFocus,
	}: {
		input?: HTMLInputElement | null;
		value: string;
		onInput: (value: string) => void;
		onSubmit: () => void;
		onEnterFromKeyboard: () => void;
		onArrowDown: () => boolean;
		onFocus?: () => void;
	} = $props();

	let focused = $state(false);
	let pointerPressed = false;
	let focusedByPointer = false;

	function isCompositionKeydown(event: KeyboardEvent): boolean {
		// https://bugs.webkit.org/show_bug.cgi?id=165004
		return event.isComposing || event.keyCode === 229;
	}

	function leaveToResults(event: KeyboardEvent) {
		if (isCompositionKeydown(event)) return;
		if (event.key === "Enter") {
			event.preventDefault();
			onSubmit();
			if (focusedByPointer) input?.blur();
			else onEnterFromKeyboard();
			return;
		}
		const { altKey, ctrlKey, metaKey, shiftKey } = event;
		const modified = altKey || ctrlKey || metaKey || shiftKey;
		if (event.key === "ArrowDown" && !modified && onArrowDown())
			event.preventDefault();
	}
</script>

<div
	data-slot="gif-search-bar"
	class="sticky top-0 z-10 bg-popover"
	onpointerdown={() => (pointerPressed = true)}
>
	<div class="-mx-4 border-b-hairline border-border px-4 py-2">
		<InputGroup.Root class="bg-muted">
			<InputGroup.Input
				bind:ref={input}
				bind:value={() => value, onInput}
				data-vaul-no-drag={focused ? "" : undefined}
				type="search"
				enterkeyhint="search"
				maxlength={GIF_INPUT_MAX_LENGTH}
				placeholder={t("chat.composer.stickers.gifs.search")}
				aria-label={t("chat.composer.stickers.gifs.search")}
				onfocus={() => {
					focused = true;
					focusedByPointer = pointerPressed;
					pointerPressed = false;
					onFocus?.();
				}}
				onblur={() => (focused = false)}
				oninput={(event) => {
					if (
						event instanceof InputEvent &&
						event.inputType === "insertFromPaste"
					)
						queueMicrotask(onSubmit);
				}}
				onkeydown={leaveToResults}
			/>
			<InputGroup.Addon>
				<MagnifyingGlassIcon />
			</InputGroup.Addon>
			{#if value !== ""}
				<InputGroup.Addon align="inline-end">
					<InputGroup.Button
						size="icon-xs"
						aria-label={t(
							"chat.composer.stickers.gifs.a11y.clearSearch",
						)}
						onclick={() => {
							onInput("");
							input?.focus();
						}}
					>
						<XIcon />
					</InputGroup.Button>
				</InputGroup.Addon>
			{/if}
		</InputGroup.Root>
	</div>
</div>

<style>
	[data-slot="gif-search-bar"] :global(input::-webkit-search-cancel-button) {
		appearance: none;
	}
</style>
