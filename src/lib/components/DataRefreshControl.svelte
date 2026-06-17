<script lang="ts">
	import { tick } from "svelte";
	import { expoOut } from "svelte/easing";
	import { Tween } from "svelte/motion";
	import { fade, type TransitionConfig } from "svelte/transition";
	import type { ClassValue } from "svelte/elements";

	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		updating,
		position,
		container,
		class: className,
		onclick,
	}: {
		updating?: boolean;
		position: "top" | "bottom";
		container?: HTMLElement | null;
		class: ClassValue;
		onclick?: () => void;
	} = $props();

	const buttonHeight = 32; // px
	const concealSlack = 8; // px
	const stickyScrolledOffset = 16; // px
	const boundarySettleDelay = 50; // ms
	const idleDelay = 200; // ms
	const labelTransition: TransitionConfig = {
		duration: 200,
		easing: expoOut,
	};
	const revealTransition: TransitionConfig = {
		duration: 250,
		easing: expoOut,
	};

	let mounted = $state(false);
	let realHeight = $state(0);
	let gap = $state(0);
	let revealed = $state(false);
	let scrolling = $state(false);
	let scrolled = $state(false);
	let distance = $state(Infinity);

	// Plain (non-reactive) flag: only ever read from DOM event handlers, never
	// from a reactive scope, so it must not trigger effects when it changes.
	let suppressRevealUntilIdle = false;

	const progress = new Tween(0, revealTransition);

	const space = $derived(realHeight + gap);
	const distanceBeyondButton = $derived(distance - (revealed ? space : 0));

	const verticalOffsetMax = $derived.by(() => {
		let value = realHeight;
		if (container) {
			const paddingStyle =
				window.getComputedStyle(container)[
					position === "top" ? "paddingTop" : "paddingBottom"
				];
			value += parseInt(paddingStyle, 10);
		}
		return -value;
	});
	const stickyMargin = $derived(scrolled ? stickyScrolledOffset : 0);
	const verticalOffset = Tween.of(
		() => (updating ? stickyMargin : verticalOffsetMax),
		labelTransition,
	);

	const maxScrollY = () =>
		container ? container.scrollHeight - container.clientHeight : 0;
	const occupiedAt = (p: number) =>
		Math.round(p * realHeight) + Math.round(-gap * (1 - p)) + gap;

	export function scrollToRest(behavior: ScrollBehavior = "instant") {
		if (!container) return;
		const rest = occupiedAt(progress.current);
		const top = position === "top" ? rest : maxScrollY() - rest;
		if (Math.abs(container.scrollTop - top) >= 1)
			suppressRevealUntilIdle = true;
		container.scroll({ top, behavior });
	}

	// Reveal while updating; conceal once idle and scrolled clear of the button.
	$effect(() => {
		if (updating && !revealed) {
			revealed = true;
		} else if (
			!updating &&
			revealed &&
			!scrolling &&
			verticalOffset.current === verticalOffsetMax &&
			distanceBeyondButton > concealSlack
		) {
			revealed = false;
		}
	});

	$effect(() => {
		if (revealed) {
			void progress.set(1);
		} else if (progress.current > 0) {
			void progress.set(0, { duration: 0 });
		}
	});

	// Keep the top-anchored scroll position stable as the control grows/shrinks.
	let compensated = 0;
	$effect(() => {
		const occupied = occupiedAt(progress.current);
		const delta = occupied - compensated;
		compensated = occupied;
		if (!container || delta === 0 || position !== "top") return;
		container.scrollTop += delta;
	});

	// Initialize measurements and resting position once the container exists.
	$effect(() => {
		if (!container) {
			mounted = false;
			return;
		}
		const el = container;
		mounted = true;
		gap = parseInt(window.getComputedStyle(el).gap, 10) || 0;
		el.style.overflowAnchor = "none";
		void tick().then(() => scrollToRest());
	});

	// Track scroll/wheel activity on the container to reveal/conceal the control.
	$effect(() => {
		if (!container) return;

		const updateDistance = () => {
			distance =
				position === "top"
					? container.scrollTop
					: maxScrollY() - container.scrollTop;
		};

		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		const onIdle = () => {
			scrolling = false;
			suppressRevealUntilIdle = false;
		};
		const markActivity = () => {
			scrolling = true;
			clearTimeout(idleTimer);
			idleTimer = setTimeout(onIdle, idleDelay);
		};

		let boundaryRevealTimer: ReturnType<typeof setTimeout> | undefined;
		const cancelBoundaryReveal = () => {
			clearTimeout(boundaryRevealTimer);
			boundaryRevealTimer = undefined;
		};
		const armBoundaryReveal = () => {
			cancelBoundaryReveal();
			if (Math.abs(distance) >= 1 || revealed) return;
			boundaryRevealTimer = setTimeout(() => {
				boundaryRevealTimer = undefined;
				if (Math.abs(distance) < 1 && !revealed) revealed = true;
			}, boundarySettleDelay);
		};

		const onScroll = () => {
			scrolled =
				position === "top"
					? container.scrollTop > 0
					: container.scrollTop < maxScrollY() - 1;
			markActivity();
			updateDistance();
			if (revealed || suppressRevealUntilIdle) {
				cancelBoundaryReveal();
				return;
			}
			if (Math.abs(distance) < 1) {
				armBoundaryReveal();
			} else {
				cancelBoundaryReveal();
			}
		};
		const onScrollEnd = () => {
			clearTimeout(idleTimer);
			onIdle();
			updateDistance();
		};
		const onWheel = (e: WheelEvent) => {
			markActivity();
			const towardBoundary = position === "top" ? e.deltaY < 0 : e.deltaY > 0;
			if (towardBoundary) {
				armBoundaryReveal();
			} else {
				cancelBoundaryReveal();
			}
		};

		const resizeObserver = new ResizeObserver(updateDistance);
		const observe = () => {
			resizeObserver.disconnect();
			resizeObserver.observe(container);
			for (const child of container.children) {
				resizeObserver.observe(child);
			}
		};
		observe();

		const mutationObserver = new MutationObserver(() => {
			observe();
			updateDistance();
		});
		mutationObserver.observe(container, { childList: true });

		container.addEventListener("scroll", onScroll);
		container.addEventListener("scrollend", onScrollEnd);
		container.addEventListener("wheel", onWheel, { passive: true });
		return () => {
			container.removeEventListener("scroll", onScroll);
			container.removeEventListener("scrollend", onScrollEnd);
			container.removeEventListener("wheel", onWheel);
			clearTimeout(idleTimer);
			clearTimeout(boundaryRevealTimer);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	});
</script>

{#if mounted}
	<div
		class={[
			"flex flex-col overflow-clip shrink-0 h-(--drc-height) opacity-(--drc-opacity) sticky z-10",
			{ "justify-end": position === "top" },
			{
				"mt-(--drc-margin)": position === "bottom",
				"mb-(--drc-margin)": position === "top",

				"top-(--drc-offset)": position === "top",
				"bottom-(--drc-offset)": position === "bottom",
			},
		]}
		style="
			--drc-progress: {progress.current};
			--drc-height: round(calc(var(--drc-progress) * {realHeight}px), 1px);
			--drc-margin: round(calc({-gap}px * (1 - var(--drc-progress))), 1px);
			--drc-opacity: max(0, calc(var(--drc-progress) * 3 - 2));

			--drc-offset: {verticalOffset.current}px;
		"
	>
		{@render button()}
	</div>
{:else}
	<div class="absolute flex invisible" bind:offsetHeight={realHeight}>
		{@render button()}
	</div>
{/if}

{#snippet button()}
	<Button
		size="sm"
		variant={updating ? "ghost" : "default"}
		disabled={updating}
		class={[
			"relative self-center transition-colors duration-(--duration) w-25 h-(--height) backdrop-blur-2xl",
			{ "disabled:opacity-100 bg-muted/50": updating },
			className,
		]}
		style="
			--duration: {labelTransition.duration}ms;
			--height: {buttonHeight}px;
		"
		{onclick}
	>
		{#if updating}
			<Skeleton class="size-full absolute bg-input" />
			<span class="label" transition:fade={labelTransition}>Updating...</span>
		{:else}
			<span class="label" transition:fade={labelTransition}>Refresh</span>
		{/if}
	</Button>
{/snippet}

<style lang="postcss">
	@reference "$layout";

	.label {
		@apply absolute z-10 top-1/2 left-1/2 -translate-1/2;
	}
</style>
