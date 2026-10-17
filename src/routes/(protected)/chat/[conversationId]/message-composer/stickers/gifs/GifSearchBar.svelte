<script lang="ts">
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import * as InputGroup from "$lib/components/ui/input-group";
	import { GIF_INPUT_MAX_LENGTH } from "./gif-feed.svelte";

	let {
		value,
		onInput,
		onSubmit,
		onFocus,
	}: {
		value: string;
		onInput: (value: string) => void;
		onSubmit: () => void;
		onFocus?: () => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let focused = $state(false);

	function isCompositionKeydown(event: KeyboardEvent): boolean {
		// https://bugs.webkit.org/show_bug.cgi?id=165004
		return event.isComposing || event.keyCode === 229;
	}

	function submitOnEnter(event: KeyboardEvent) {
		if (event.key !== "Enter" || isCompositionKeydown(event)) return;
		event.preventDefault();
		onSubmit();
		input?.blur();
	}
</script>

<div data-slot="gif-search-bar" class="sticky top-0 z-10 bg-popover">
	<div class="-mx-4 border-b-hairline border-border px-4 py-2">
		<InputGroup.Root class="bg-muted">
			<InputGroup.Input
				bind:ref={input}
				bind:value={() => value, onInput}
				data-vaul-no-drag={focused ? "" : undefined}
				type="search"
				enterkeyhint="search"
				maxlength={GIF_INPUT_MAX_LENGTH}
				placeholder="Search GIFs or paste GIPHY link"
				aria-label="Search GIFs or paste GIPHY link"
				onfocus={() => {
					focused = true;
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
				onkeydown={submitOnEnter}
			/>
			<InputGroup.Addon>
				<MagnifyingGlassIcon />
			</InputGroup.Addon>
			{#if value !== ""}
				<InputGroup.Addon align="inline-end">
					<InputGroup.Button
						size="icon-xs"
						aria-label="Clear search"
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
