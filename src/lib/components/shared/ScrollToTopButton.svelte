<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";
	import { prefersReducedMotion } from "svelte/motion";

	import { glideScrollTop } from "#lib/util/scroll.ts";
	import { cn } from "#lib/util/utils.ts";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		text,
		onjump,
		labeled = $bindable(false),
		class: className,
	}: {
		container: HTMLElement | null;
		text?: string;
		onjump?: () => void;
		labeled?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const TOP_SLOP_PX = 16;
	const GLIDE_MS = 400;

	let atTop = $state(true);
	let cancelGlide: (() => void) | null = null;

	function releaseGlide() {
		cancelGlide?.();
		cancelGlide = null;
	}

	function settle() {
		releaseGlide();
		atTop = (container?.scrollTop ?? 0) <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			if (cancelGlide === null) settle();
		};

		settle();
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", onScroll, { passive: true });
		el.addEventListener("wheel", releaseGlide, { passive: true });
		el.addEventListener("touchstart", releaseGlide, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", onScroll);
			el.removeEventListener("wheel", releaseGlide);
			el.removeEventListener("touchstart", releaseGlide);
			releaseGlide();
		};
	});

	$effect.pre(() => {
		if (!atTop) labeled = text !== undefined;
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		releaseGlide();
		atTop = true;
		onjump?.();
		if (prefersReducedMotion.current) {
			el.scrollTop = 0;
			return;
		}
		el.scrollTop = Math.min(el.scrollTop, el.clientHeight);
		cancelGlide = glideScrollTop({
			element: el,
			durationMs: GLIDE_MS,
			onLanded: settle,
		});
	}
</script>

{#if !atTop}
	<ScrollJumpButton
		label={text === undefined ? "Scroll to top" : `${text}, scroll to top`}
		size={labeled ? "lg" : "icon-lg"}
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
		onoutroend={() => (labeled = false)}
	>
		<CaretUpIcon />
		{#if text !== undefined}
			{text}
		{/if}
	</ScrollJumpButton>
{/if}
