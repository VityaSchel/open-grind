<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { onDestroy, onMount, type Snippet } from "svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import type { NavigationTarget } from "@sveltejs/kit";
	import type { Attachment } from "svelte/attachments";

	import {
		softKeyboardHidden,
		softKeyboardVisibility,
	} from "$lib/platform/android-native-bridge";
	import { attachSystemBackGesture } from "$lib/platform/system-back-gesture";
	import { previousEntryPathname } from "$lib/util/history";
	import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";
	import { LiveStack } from "./page-stack/live-stack.svelte";
	import { STACK_Z } from "./page-stack/motion";
	import { paneSurface } from "./page-stack/surface";

	let {
		top,
		basePath,
		keyOf,
		base,
		sheet,
	}: {
		top: string | null;
		basePath: string;
		keyOf: (target: NavigationTarget) => string | null;
		base: Snippet<[{ covered: boolean }]>;
		sheet: Snippet<[string, { leaving: boolean }]>;
	} = $props();

	const KEYBOARD_SETTLE_MS = 150;

	let basePane: HTMLElement | null = $state(null);
	let sheetPane: HTMLElement | null = null;
	let dim: HTMLElement | null = $state(null);

	const stack: LiveStack = new LiveStack({
		surface: paneSurface({
			panes: () => ({ front: sheetPane, back: basePane, dim }),
			parallax: () => !prefersReducedMotion.current,
		}),
		top: () => top,
		keyOf: (target) => keyOf(target),
		inScope: (pathname) =>
			pathname === basePath || pathname.startsWith(`${basePath}/`),
		reducedMotion: () => prefersReducedMotion.current,
		backLandsOnBase: () => previousEntryPathname() === basePath,
		keyboardVisible: () => softKeyboardVisibility() === true,
		keyboardHidden: () =>
			softKeyboardHidden({ settleMs: KEYBOARD_SETTLE_MS }),
	});

	let baseMounted = $state(!stack.covered);

	onMount(() => {
		if (baseMounted) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				baseMounted = true;
			}),
		);
	});

	const placePane: Attachment<HTMLElement> = (pane) => {
		sheetPane = pane;
		stack.applyFrame();
		return () => {
			if (sheetPane === pane) sheetPane = null;
		};
	};

	onNavigate((navigation) => stack.navigate(navigation));

	$effect(() => attachSystemBackGesture(stack));

	$effect(() => {
		void stack.covered;
		void stack.leaving;
		remeasureScreenChrome();
	});

	onDestroy(() => stack.dispose());
</script>

<div
	bind:this={basePane}
	data-slot="live-stack-base"
	class="fixed inset-0 flex flex-col bg-background pt-(--safe-area-top) pb-(--safe-area-bottom)"
	style:z-index={STACK_Z.back}
	style:visibility={stack.covered ? "hidden" : null}
	inert={stack.sheet !== null}
>
	{#if baseMounted}
		{@render base({ covered: stack.covered })}
	{/if}
</div>
{#if stack.moving || stack.tracking}
	<div
		bind:this={dim}
		data-slot="live-stack-dim"
		class="pointer-events-none fixed inset-0 bg-black opacity-0"
		style:z-index={STACK_Z.dim}
	></div>
{/if}
{#if stack.sheet !== null}
	{#key stack.sheet}
		<div
			{@attach placePane}
			data-slot="live-stack-sheet"
			class="fixed inset-0 flex flex-col bg-background pt-(--safe-area-top) pb-(--safe-area-bottom)"
			style:z-index={STACK_Z.front}
			inert={stack.leaving !== null}
			data-leaving={stack.leaving !== null || undefined}
		>
			{@render sheet(stack.sheet, { leaving: stack.leaving !== null })}
		</div>
	{/key}
{/if}
