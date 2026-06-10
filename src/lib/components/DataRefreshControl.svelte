<script lang="ts">
	import { tick } from "svelte";
	import { expoOut } from "svelte/easing";
	import { Tween } from "svelte/motion";
	import { fade, type TransitionConfig } from "svelte/transition";

	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";

	let {
		updating,
		sticky,
		position,
		stickyScrolledOffset = 16,
		container,
		class: className,
		onclick,
	}: {
		sticky?: boolean;
		updating?: boolean;
		position: "top" | "bottom";
		stickyScrolledOffset?: number;
		container?: HTMLElement | null;
		class: import("svelte/elements").ClassValue;
		onclick?: () => void;
	} = $props();

	const buttonHeight = 32; // px
	const labelTransition: TransitionConfig = {
		duration: 200,
		easing: expoOut,
	};

	let mounted = $state(false);
	let realHeight = $state(0);
	let scrolled = $state(false);

	const verticalOffsetMax = $derived(
		buttonHeight +
			(container
				? parseInt(
						window.getComputedStyle(container)[
							position === "top" ? "paddingTop" : "paddingBottom"
						],
						10,
					)
				: 0),
	);
	const stickyMargin = $derived(scrolled ? stickyScrolledOffset : 0);

	const verticalOffset = Tween.of(
		() => (updating ? stickyMargin : -verticalOffsetMax),
		labelTransition,
	);

	const maxScrollY = () =>
		container ? container.scrollHeight - container.clientHeight : 0;

	export function scrollToRest(behavior: ScrollBehavior = "instant") {
		if (!container) return;
		const gap = parseInt(window.getComputedStyle(container).gap, 10);
		container.scroll({
			top:
				position === "top"
					? realHeight + gap
					: maxScrollY() - (realHeight + gap),
			behavior,
		});
	}

	$effect(() => {
		if (!container) {
			mounted = false;
			return;
		}
		mounted = true;
		void tick().then(() => scrollToRest());
	});

	$effect(() => {
		if (!container) return;
		const el = container;

		const updateScrolled = () => {
			scrolled =
				position === "top" ? el.scrollTop > 0 : el.scrollTop < maxScrollY() - 1;
		};

		const resizeObserver = new ResizeObserver(updateScrolled);
		const observe = () => {
			resizeObserver.disconnect();
			resizeObserver.observe(el);
			for (const child of el.children) resizeObserver.observe(child);
		};
		observe();

		const mutationObserver = new MutationObserver(() => {
			observe();
			updateScrolled();
		});
		mutationObserver.observe(el, { childList: true });

		el.addEventListener("scroll", updateScrolled);
		return () => {
			el.removeEventListener("scroll", updateScrolled);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	});
</script>

{#if mounted}
	{@render button()}
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
			"relative transition-colors duration-(--duration) w-25 h-(--height) backdrop-blur-2xl",
			{
				"sticky self-center z-10": sticky,
				"disabled:opacity-100 bg-muted/50": updating,
				"top-(--offset)": sticky && position === "top",
				"bottom-(--offset)": sticky && position === "bottom",
			},
			className,
		]}
		style="
			--offset: {verticalOffset.current}px;
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
