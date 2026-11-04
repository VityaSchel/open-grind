<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";

	import { answerStatusBarTaps } from "#lib/platform/status-bar-tap.ts";
	import {
		glidingToTop,
		jumpThenGlideToTop,
		stopGlidingToTop,
	} from "#lib/util/scroll.ts";
	import { cn } from "#lib/util/utils.ts";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		class: className,
	}: {
		container: HTMLElement | null;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const TOP_SLOP_PX = 16;

	let atTop = $state(true);

	function settle() {
		atTop = (container?.scrollTop ?? 0) <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			if (!glidingToTop(el)) settle();
		};

		settle();
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", onScroll, { passive: true });
		const stopAnswering = answerStatusBarTaps({
			scroller: el,
			scrollToTop,
		});
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", onScroll);
			stopAnswering?.();
			stopGlidingToTop(el);
		};
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		atTop = true;
		jumpThenGlideToTop({ element: el, onLanded: settle });
	}
</script>

{#if !atTop}
	<ScrollJumpButton
		label="Scroll to top"
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
	>
		<CaretUpIcon />
	</ScrollJumpButton>
{/if}
